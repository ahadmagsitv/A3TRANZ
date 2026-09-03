/**
 * Push, via FCM's HTTP v1 API.
 *
 * Two steps: sign a JWT with the service-account key, trade it for an access
 * token, then POST the message. `firebase-admin` does the same thing behind
 * ~50 MB of SDK; this is the part we use, in the same hand-rolled style as the
 * S3 signer next door.
 *
 * ponytail: no batching and no retry. Each notification is one request, and a
 * failed push is logged, not retried — the notification row is already in the
 * database and the Alerts tab shows it either way, so a lost push costs a
 * badge, not information. Move to `messages:send` batching or the outbox the
 * day volume makes that a problem.
 */
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
    // A misconfigured path must not take the API down — push is an extra, the
    // notification row is the record. But it must not be SILENT either: a
    // truncated path in .env turned every push into a no-op on the server and
    // looked identical to "no devices registered". Warned once, because this
    // runs on every notification.
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

/** Google's OAuth token, cached until a minute before it expires. */
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
  /** Travels with the tap so the app can open the right screen. */
  data: Record<string, string>;
}

/**
 * Push to every device a user has signed in on. Never throws: a dead token or
 * a Firebase outage must not fail the request that was writing the row.
 */
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
            // Strings only — FCM rejects any other type in `data`.
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

      // A token for an app that has been uninstalled is gone for good — drop
      // it rather than pushing to it forever.
      const err = (await res.json().catch(() => ({}))) as {
        error?: { status?: string };
      };
      if (res.status === 404 || err.error?.status === 'NOT_FOUND' ||
          err.error?.status === 'INVALID_ARGUMENT') {
        await q(`DELETE FROM device_tokens WHERE token = $1`, [row.token]);
      }
    } catch {
      // Network trouble reaching Google. The Alerts tab still has the row.
    }
  }

  return sent;
};

/** Test seam — forces the next call to re-read credentials. */
export const resetFcm = (): void => {
  account = null;
  warnedAboutCredentials = false;
  accessToken = null;
};
