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
import { AuthError, OFFICE_ROLES, type Role } from '@a3/domain';
import { pool, q, tx } from '../db.ts';
import { HttpError, conflict, forbidden, notFound } from '../errors.ts';
import { authenticate, requires } from '../guard.ts';
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

/** Two initials from a name — the avatar in every members table. */
const initialsOf = (name: string): string =>
  name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');

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

  /**
   * W13 team members table. Office roles only — never lists drivers.
   *
   * `manageTeam`, not merely office-only: the roster is every colleague's name,
   * email and rank, and a dispatcher has no reason to hold it.
   */
  app.get('/auth/team', { preHandler: requires('manageTeam') }, async (_req, reply) => {
    // Inactive members included: this is the screen that puts them back.
    const { rows } = await q(
      `SELECT id, name, initials, email, role, active FROM users
        WHERE role <> 'driver' ORDER BY active DESC, name`,
    );
    return reply.send({ users: rows });
  });

  /**
   * W13 "Add member". The office-staff twin of `POST /drivers` — same shape,
   * same invite mechanism (§9 B2), different role set. Still no signup: the
   * only way an account comes into existence is an admin creating it.
   */
  app.post('/auth/team', { preHandler: requires('manageTeam') }, async (req, reply) => {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(200),
        email: z.string().trim().email().max(320),
        // The one field that must never accept 'driver' — a driver row carries
        // phone/base and is reached through `/drivers`.
        role: z.enum(OFFICE_ROLES as [Role, ...Role[]]),
        /**
         * ponytail: same stand-in as the driver form — a password the admin
         * hands over in person because invite mail does not send yet. The
         * invite link is issued regardless; drop this field the day mail works.
         */
        tempPassword: z.string().min(8).max(200).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'bad_request', 'That team member is not complete.', 'email');
    }
    const d = parsed.data;

    const user = await tx(async c => {
      const { rows: dupe } = await c.query('SELECT 1 FROM users WHERE email = $1', [d.email]);
      if (dupe[0]) throw conflict('Someone already uses that email address.');

      const { rows } = await c.query<{ n: string }>(
        `SELECT to_char(coalesce(max(substring(id from 'ADM-([0-9]+)')::int),0)+1,'FM000') n
           FROM users WHERE role <> 'driver'`,
      );
      const id = `ADM-${rows[0]!.n}`;
      const initials = initialsOf(d.name);

      await c.query(
        `INSERT INTO users (id,email,password_hash,name,initials,role,phone,base,active)
         VALUES ($1,$2,$3,$4,$5,$6,'','Houston',true)`,
        [id, d.email, await hash(d.tempPassword ?? randomBytes(32).toString('hex')),
         d.name, initials, d.role],
      );

      const invite = await issueReset(c, id, '7 days', true);
      req.log.info({ email: d.email, invite }, 'team member invite issued');

      return { id, name: d.name, initials, email: d.email, role: d.role };
    });

    return reply.code(201).send({ user });
  });

  /**
   * W13 row menu — edit, deactivate, reactivate. One route: the three are the
   * same UPDATE with different fields set, and splitting them would be three
   * copies of the same guards.
   *
   * The guard that matters is "never yourself". It is not politeness — it is
   * what keeps the console reachable: only a manageTeam holder can call this,
   * and a caller who cannot demote, deactivate or delete their own account is
   * a manageTeam holder who is still standing when the request finishes. That
   * one rule is why there is no separate "don't remove the last admin" check.
   */
  app.patch('/auth/team/:id', { preHandler: requires('manageTeam') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(200).optional(),
        email: z.string().trim().email().max(320).optional(),
        role: z.enum(OFFICE_ROLES as [Role, ...Role[]]).optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'bad_request', 'Invalid change.', 'email');
    const d = parsed.data;

    if (id === req.caller.user.id) {
      throw forbidden('You cannot change your own role or access from here.');
    }

    const { user, roleChanged } = await tx(async c => {
      // Read first, and lock: the edit form sends every field, changed or
      // not, so "did the role actually change" cannot be inferred from the
      // request — and it decides whether they get signed out.
      const { rows: [before] } = await c.query<{ role: Role }>(
        `SELECT role FROM users WHERE id = $1 AND role <> 'driver' FOR UPDATE`,
        [id],
      );
      if (!before) throw notFound('That team member could not be found.');

      if (d.email) {
        const { rows: dupe } = await c.query(
          'SELECT 1 FROM users WHERE email = $1 AND id <> $2',
          [d.email, id],
        );
        if (dupe[0]) throw conflict('Someone already uses that email address.');
      }

      const { rows } = await c.query<{
        id: string; name: string; initials: string; email: string;
        role: Role; active: boolean;
      }>(
        `UPDATE users SET
           name  = coalesce($2, name),
           email = coalesce($3, email),
           role  = coalesce($4, role),
           active = coalesce($5, active),
           -- Renaming has to move the initials with it, or the avatar keeps
           -- showing the initials of a name nobody has any more.
           initials = CASE WHEN $2::text IS NULL THEN initials ELSE $6 END
         WHERE id = $1 AND role <> 'driver'
         RETURNING id, name, initials, email, role, active`,
        [id, d.name ?? null, d.email ?? null, d.role ?? null, d.active ?? null,
         d.name ? initialsOf(d.name) : null],
      );
      return { user: rows[0]!, roleChanged: !!d.role && d.role !== before.role };
    });

    // Same reason drivers are logged out when stood down: a revoked account
    // must not keep working on the token it already holds. A role CHANGE
    // revokes too — the session carries no role, so a demoted manager would
    // otherwise keep manager access until they happened to sign out. A name
    // or email edit does not: there is nothing stale about their session.
    if (d.active === false || roleChanged) await revokeAllFor(id);

    return reply.send({ user });
  });

  /**
   * W13 row menu — delete.
   *
   * Deliberately a real DELETE, and deliberately allowed to fail. Anyone who
   * has sent a message, written a note, uploaded a photo or filed a defect is
   * referenced by rows that are the record of what happened, and Postgres
   * refuses to orphan them. That refusal is the rule — not a check written
   * here that would drift from the schema — and it becomes "deactivate them
   * instead", which keeps the history and takes away the access.
   */
  app.delete('/auth/team/:id', { preHandler: requires('manageTeam') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id === req.caller.user.id) throw forbidden('You cannot delete your own account.');

    try {
      const { rowCount } = await q(`DELETE FROM users WHERE id = $1 AND role <> 'driver'`, [id]);
      if (!rowCount) throw notFound('That team member could not be found.');
    } catch (e) {
      if ((e as { code?: string }).code === '23503') {
        throw conflict(
          'This account has job history and cannot be deleted. Deactivate it instead — that removes their access and keeps the record.',
        );
      }
      throw e;
    }
    return reply.code(204).send();
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
