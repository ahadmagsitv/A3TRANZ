/**
 * Auth routes. One per AuthRepo method (BACKEND_PLAN §1.1).
 *
 * There is deliberately NO signup endpoint. Drivers are added by an admin and
 * office staff by an admin; the design has no self-registration screen and the
 * API has no way to reach one.
 */
import type { FastifyInstance } from 'fastify';
import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { AuthError, type Role } from '@a3/domain';
import { pool, q, tx } from '../db.ts';
import { HttpError } from '../errors.ts';
import { authenticate, officeOnly } from '../guard.ts';
import { hash, issueReset, verify } from '../password.ts';
import { bearer, issue, revoke, revokeAllFor } from '../session.ts';

const credentials = z.object({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(200),
});

/** Failures allowed per email and per IP inside the window. */
const WINDOW_MINUTES = 15;
const MAX_PER_EMAIL = 8;
const MAX_PER_IP = 30;

const RESET_TTL_MINUTES = 30;
const RESET_COPY = {
  expiryLabel: `It expires in ${RESET_TTL_MINUTES} minutes.`,
};

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async (req, reply) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      throw new AuthError('invalid_credentials', 'Enter your email and password.');
    }
    const { email, password } = parsed.data;
    const ip = req.ip;

    // Throttle before touching the password hash — scrypt is the expensive
    // part and an unthrottled login is a free CPU-exhaustion primitive.
    const { rows: [throttle] } = await q<{ by_email: string; by_ip: string }>(
      `SELECT
         count(*) FILTER (WHERE email = $1)::text AS by_email,
         count(*) FILTER (WHERE ip = $2)::text    AS by_ip
       FROM login_attempts
       WHERE at > now() - ($3 || ' minutes')::interval`,
      [email, ip, String(WINDOW_MINUTES)],
    );
    if (
      Number(throttle?.by_email ?? 0) >= MAX_PER_EMAIL ||
      Number(throttle?.by_ip ?? 0) >= MAX_PER_IP
    ) {
      throw new HttpError(
        429,
        'too_many_attempts',
        `Too many attempts. Try again in ${WINDOW_MINUTES} minutes.`,
      );
    }

    const { rows: [user] } = await q<{
      id: string;
      name: string;
      initials: string;
      email: string;
      role: Role;
      active: boolean;
      password_hash: string;
    }>(
      `SELECT id, name, initials, email, role, active, password_hash
         FROM users WHERE email = $1`,
      [email],
    );

    // Same error and roughly the same work for "no such user" and "wrong
    // password": a distinguishable response is an account-enumeration oracle.
    const ok = user
      ? await verify(password, user.password_hash)
      : await verify(password, await hash(randomBytes(16).toString('hex')));

    if (!user || !ok) {
      await q('INSERT INTO login_attempts (email, ip) VALUES ($1, $2)', [email, ip]);
      throw new AuthError(
        'invalid_credentials',
        'That email and password do not match.',
        'password',
      );
    }
    if (!user.active) {
      throw new AuthError(
        'inactive_account',
        'This account is no longer active. Contact dispatch.',
      );
    }

    const token = await issue(user.id);
    await q('DELETE FROM login_attempts WHERE email = $1', [email]);
    await q('UPDATE users SET last_active_at = now() WHERE id = $1', [user.id]);

    return reply.send({
      token,
      user: {
        id: user.id,
        name: user.name,
        initials: user.initials,
        email: user.email,
        role: user.role,
      },
    });
  });

  app.post('/auth/logout', async (req, reply) => {
    // Unauthenticated on purpose: logging out with a dead token should succeed,
    // not 401 and strand the client holding it.
    const token = bearer(req.headers.authorization);
    if (token) await revoke(token);
    return reply.code(204).send();
  });

  app.get('/auth/me', { preHandler: authenticate }, async (req, reply) =>
    reply.send({ user: req.caller.user }),
  );

  /** W13 team members table. Office roles only — never lists drivers. */
  app.get('/auth/team', { preHandler: officeOnly }, async (_req, reply) => {
    const { rows } = await q(
      `SELECT id, name, initials, email, role FROM users
        WHERE role <> 'driver' AND active ORDER BY name`,
    );
    return reply.send({ users: rows });
  });

  /**
   * M3. Always resolves with the same copy whether or not the email exists —
   * "we sent a link if that address is on file" is the only answer that does
   * not tell a stranger who has an account here.
   */
  app.post('/auth/reset-request', async (req, reply) => {
    const parsed = z
      .object({ email: z.string().trim().min(1).max(320) })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new AuthError('unknown_email', 'Enter the email on your account.', 'email');
    }
    const { email } = parsed.data;

    const { rows: [user] } = await q<{ id: string }>(
      'SELECT id FROM users WHERE email = $1 AND active',
      [email],
    );
    if (user) {
      const token = await issueReset(pool, user.id, `${RESET_TTL_MINUTES} minutes`);
      // ponytail: the send is a Phase 5 outbox row. Until then the link is
      // logged, which is what a dev environment wants anyway.
      req.log.info({ email, token }, 'password reset link issued');
    }

    return reply.send({ sentTo: email, ...RESET_COPY });
  });

  /**
   * Redeem a reset or invite link (M3 → set a new password, and the W9 driver
   * invite, which is the same mechanism with a longer TTL — see BACKEND_PLAN
   * B2). Without this the link issued above goes nowhere and an admin-added
   * driver can never sign in: their password is random bytes nobody has.
   *
   * Unauthenticated by necessity — the token IS the credential. It is single
   * use, time limited, and stored only as a SHA-256 hash, so the table is not
   * a list of working links if it leaks.
   */
  app.post('/auth/reset', async (req, reply) => {
    const parsed = z
      .object({
        token: z.string().min(1).max(400),
        password: z.string().min(1).max(200),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new AuthError('password_too_short', 'Choose a new password.', 'password');
    }
    const { token, password } = parsed.data;

    if (password.length < 8) {
      throw new AuthError(
        'password_too_short',
        'Your new password needs at least 8 characters.',
        'password',
      );
    }

    // Claim the row and set the password in one transaction: two people
    // redeeming the same link concurrently must not both win.
    const userId = await tx(async c => {
      const { rows: [row] } = await c.query<{ user_id: string; active: boolean }>(
        `UPDATE password_resets pr
            SET used_at = now()
           FROM users u
          WHERE pr.user_id = u.id
            AND pr.token_hash = $1
            AND pr.used_at IS NULL
            AND pr.expires_at > now()
        RETURNING pr.user_id, u.active`,
        [createHash('sha256').update(token).digest('hex')],
      );
      if (!row) {
        throw new AuthError(
          'invalid_credentials',
          'This link has expired or has already been used. Request a new one.',
          'password',
        );
      }
      if (!row.active) {
        throw new AuthError(
          'inactive_account',
          'This account is no longer active. Contact dispatch.',
        );
      }
      await c.query('UPDATE users SET password_hash = $2 WHERE id = $1', [
        row.user_id,
        await hash(password),
      ]);
      return row.user_id;
    });

    // Whoever held a session before the reset does not keep it — the usual
    // reason to reset is that someone else may have had the old password.
    await revokeAllFor(userId);

    return reply.send({ ok: true, signedOutEverywhere: true });
  });
}
