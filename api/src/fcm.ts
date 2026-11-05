import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { env } from './env.ts';
import { q } from './db.ts';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri: string;
}

let account: ServiceAccount | null = null;
let warnedAboutCredentials = false;
let accessToken: { value: string; expiresAt: number } | null = null;

const b64url = (v: string | Buffer): string =>
  Buffer.from(v).toString('base64url');

const loadAccount = async (): Promise<ServiceAccount | null> => {
  if (account) return account;
  if (!env.fcmCredentials) return null;
  try {
    account = JSON.parse(await readFile(env.fcmCredentials, 'utf8')) as ServiceAccount;
    return account;
  } catch (e) {
    if (!warnedAboutCredentials) {
      warnedAboutCredentials = true;
      console.warn(
        `push disabled: cannot read FCM_CREDENTIALS at ${env.fcmCredentials} —`,
        e instanceof Error ? e.message : e,
      );
    }
    return null;
  }
};

const getAccessToken = async (sa: ServiceAccount): Promise<string | null> => {
  if (accessToken && accessToken.expiresAt > Date.now()) return accessToken.value;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;

  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) return null;

  const body = (await res.json()) as { access_token: string; expires_in: number };
  accessToken = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in - 60) * 1000,
  };
  return accessToken.value;
};

export interface PushInput {
  userId: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

export const push = async (n: PushInput): Promise<number> => {
  const sa = await loadAccount();
  if (!sa) return 0;

  const { rows } = await q<{ token: string }>(
    `SELECT token FROM device_tokens WHERE user_id = $1`,
    [n.userId],
  );
  if (rows.length === 0) return 0;

  const token = await getAccessToken(sa);
  if (!token) return 0;

  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  let sent = 0;

  for (const row of rows) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: row.token,
            notification: { title: n.title, body: n.body },
            data: n.data,
            apns: {
              payload: { aps: { sound: 'default', badge: 1 } },
            },
            android: { priority: 'high', notification: { sound: 'default' } },
          },
        }),
      });

      if (res.ok) {
        sent += 1;
        continue;
      }

      const err = (await res.json().catch(() => ({}))) as {
        error?: { status?: string };
      };
      if (res.status === 404 || err.error?.status === 'NOT_FOUND' ||
          err.error?.status === 'INVALID_ARGUMENT') {
        await q(`DELETE FROM device_tokens WHERE token = $1`, [row.token]);
      }
    } catch {
    }
  }

  return sent;
};

