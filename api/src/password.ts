import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

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
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

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
