/**
 * scrypt from node:crypto. It is a real password KDF, it is stdlib, and it
 * skips argon2's native build step. Parameters are the Node defaults bumped to
 * N=2^15, which lands around 100ms on the target hardware.
 *
 * ponytail: swap to argon2id the day a security review asks for it — only
 * `hash`/`verify` change, and the `scrypt$` prefix is what tells the two apart
 * so old hashes keep verifying through the transition.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/** A pool or a transaction client — both expose `query`. */
interface Runner {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: { name: string; email: string | null }[] }>;
}

const derive = promisify(scrypt) as (
  pw: string,
  salt: Buffer,
  len: number,
  opts: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 32;

export const hash = async (pw: string): Promise<string> => {
  const salt = randomBytes(16);
  const key = await derive(pw, salt, KEYLEN, PARAMS);
  return `scrypt$${PARAMS.N}$${salt.toString('base64')}$${key.toString('base64')}`;
};

export const verify = async (pw: string, stored: string): Promise<boolean> => {
  const [scheme, n, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await derive(pw, Buffer.from(saltB64, 'base64'), expected.length, {
    ...PARAMS,
    N: Number(n),
  });
  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false, and a thrown error is a louder oracle than a slow compare.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

/**
 * Issue a reset/invite token, retiring every outstanding one for that user.
 *
 * At most one live token per user, enforced by deleting rather than flagging:
 * a link the driver abandoned — or one someone copied off a forwarded email —
 * stops working the moment a fresh one is requested. Both callers (the M3
 * reset and the W9 driver invite) come through here and differ only in TTL,
 * so the "newest link wins" rule cannot drift between them.
 *
 * Takes a runner rather than importing `q` so the invite can stay inside the
 * transaction that creates the driver: no user without an invite, no invite
 * without a user, and no invite without the email that carries it.
 */
export const issueReset = async (
  run: Runner,
  userId: string,
  ttl: string,
  invite = false,
): Promise<string> => {
  const token = randomBytes(32).toString('base64url');
  await run.query('DELETE FROM password_resets WHERE user_id = $1', [userId]);
  await run.query(
    `INSERT INTO password_resets (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + $3::interval)`,
    [createHash('sha256').update(token).digest('hex'), userId, ttl],
  );

  // Queue the mail here rather than at the call sites: a link that is issued
  // but never delivered is the failure this whole path exists to avoid, and
  // `req.log.info` does not deliver it — dev logging sits at 'warn', so the
  // link was previously invisible and an invited driver could never sign in.
  //
  // The payload carries the plaintext token because the mail cannot be built
  // without it. That is the one place it exists outside the email itself, and
  // it stops mattering the moment the row is sent or the TTL passes.
  const { rows } = await run.query(
    'SELECT name, email FROM users WHERE id = $1',
    [userId],
  );
  const u = rows[0];
  if (u?.email) {
    await run.query(
      `INSERT INTO outbox (kind, payload) VALUES ('password_reset', $1)`,
      [JSON.stringify({ to: u.email, name: u.name, token, invite })],
    );
  }
  return token;
};
