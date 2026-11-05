import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AuthUser, Role } from '@a3/domain';
import { q } from './db.ts';
import { env } from './env.ts';
import { unauthorized, HttpError } from './errors.ts';

const sha256 = (s: string): string =>
  createHash('sha256').update(s).digest('hex');

export interface Caller {
  user: AuthUser;
  active: boolean;
}

export const issue = async (userId: string): Promise<string> => {
  const token = randomBytes(32).toString('base64url');
  await q(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [sha256(token), userId, String(env.sessionDays)],
  );
  return token;
};

export const revoke = async (token: string): Promise<void> => {
  await q(
    `UPDATE sessions SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [sha256(token)],
  );
};

export const revokeAllFor = async (userId: string): Promise<void> => {
  await q(
    `UPDATE sessions SET revoked_at = now()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
};

export const resolve = async (token: string | undefined): Promise<Caller> => {
  if (!token) throw unauthorized();

  const { rows } = await q<{
    id: string;
    name: string;
    initials: string;
    email: string;
    role: Role;
    active: boolean;
  }>(
    `UPDATE sessions s SET last_seen_at = now()
       FROM users u
      WHERE s.token_hash = $1
        AND s.user_id = u.id
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
      RETURNING u.id, u.name, u.initials, u.email, u.role, u.active`,
    [sha256(token)],
  );

  const row = rows[0];
  if (!row) throw unauthorized('Your session has expired. Sign in again.');
  if (!row.active) {
    throw new HttpError(
      403,
      'inactive_account',
      'This account is no longer active. Contact dispatch.',
    );
  }

  return {
    user: {
      id: row.id,
      name: row.name,
      initials: row.initials,
      email: row.email,
      role: row.role,
    },
    active: row.active,
  };
};

export const bearer = (header: string | undefined): string | undefined => {
  if (!header) return undefined;
  const prefix = 'Bearer ';
  if (header.length <= prefix.length) return undefined;
  const got = Buffer.from(header.slice(0, prefix.length));
  const want = Buffer.from(prefix);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return undefined;
  return header.slice(prefix.length).trim() || undefined;
};
