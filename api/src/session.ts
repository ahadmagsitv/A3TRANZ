/**
 * Sessions. A random 32-byte token goes to the client; only its SHA-256 lands
 * in the database, so a dump of `sessions` cannot be replayed as a login.
 *
 * SHA-256 with no salt is right here and wrong for passwords: the token is
 * already 256 bits of entropy, so there is nothing to brute-force and nothing
 * a rainbow table can precompute. Passwords go through scrypt (password.ts).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AuthUser, Role } from '@a3/domain';
import { q } from './db.ts';
import { env } from './env.ts';
import { forbidden, unauthorized, HttpError } from './errors.ts';

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

/** Deactivating a driver (W8-confirm) must log them out now, not at expiry. */
export const revokeAllFor = async (userId: string): Promise<void> => {
  await q(
    `UPDATE sessions SET revoked_at = now()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
};

/**
 * Resolves a bearer token to its caller, or throws. Joins `users` every time
 * rather than trusting anything carried in the token: a role change or a
 * deactivation takes effect on the very next request, which is the whole
 * reason these are not JWTs.
 */
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
    // `inactive_account`, not the generic `forbidden` an RBAC refusal uses:
    // both are 403, but one means "sign in again as someone else" and the
    // other means "you are signed in, you just cannot do that". The clients
    // sign out on the first and stay put on the second, so they must be
    // distinguishable. Same code the login route already returns for it.
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

/** Bearer header → token. Constant-time on the scheme to keep it boring. */
export const bearer = (header: string | undefined): string | undefined => {
  if (!header) return undefined;
  const prefix = 'Bearer ';
  if (header.length <= prefix.length) return undefined;
  const got = Buffer.from(header.slice(0, prefix.length));
  const want = Buffer.from(prefix);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return undefined;
  return header.slice(prefix.length).trim() || undefined;
};
