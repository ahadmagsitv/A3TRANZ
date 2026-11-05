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

const WINDOW_MINUTES = 15;
const MAX_PER_EMAIL = 8;
const MAX_PER_IP = 30;

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
    const token = bearer(req.headers.authorization);
    if (token) await revoke(token);
    return reply.code(204).send();
  });

  app.get('/auth/me', { preHandler: authenticate }, async (req, reply) =>
    reply.send({ user: req.caller.user }),
  );

  app.get('/auth/team', { preHandler: requires('manageTeam') }, async (_req, reply) => {
    const { rows } = await q(
      `SELECT id, name, initials, email, role, active FROM users
        WHERE role <> 'driver' ORDER BY active DESC, name`,
    );
    return reply.send({ users: rows });
  });

  app.post('/auth/team', { preHandler: requires('manageTeam') }, async (req, reply) => {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(200),
        email: z.string().trim().email().max(320),
        role: z.enum(OFFICE_ROLES as [Role, ...Role[]]),
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
      void invite;

      return { id, name: d.name, initials, email: d.email, role: d.role };
    });

    return reply.code(201).send({ user });
  });

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

    if (d.active === false || roleChanged) await revokeAllFor(id);

    return reply.send({ user });
  });

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
      await issueReset(pool, user.id, `${RESET_TTL_MINUTES} minutes`);
    }

    return reply.send({ sentTo: email, ...RESET_COPY });
  });

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

    await revokeAllFor(userId);

    return reply.send({ ok: true, signedOutEverywhere: true });
  });
}
