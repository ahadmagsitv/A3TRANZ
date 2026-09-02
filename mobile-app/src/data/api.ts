/**
 * The one place that talks to the API.
 *
 * Every repo goes through `api()`, so the base URL, the bearer token and the
 * error shape live in a single file rather than being guessed at by each of
 * the eight.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthError, type AuthErrorCode } from './contracts';

/**
 * The iOS simulator reaches the host as `localhost`; the Android emulator uses
 * `10.0.2.2`, and a physical device needs this machine's LAN address. Metro
 * does not inline arbitrary `process.env` values in a bare RN app, so this is
 * a constant rather than an env read — change it here, or point it at a
 * deployed API once B1 (hosting) is answered.
 */
export const API_URL = 'http://localhost:4000';

/**
 * The session token, cached in memory and mirrored to device storage.
 *
 * A driver works a full shift; being signed out every time the OS reclaims the
 * app is not an acceptable cost. The cache is what `api()` reads on every
 * request — a disk hit per call would be wasteful — and `restore()` hydrates
 * it once at launch, which is the only moment the two can disagree.
 *
 * ponytail: AsyncStorage, not Keychain. This is a bearer token with a server
 * expiry that logout revokes, not a password. Move it to Keychain if a threat
 * model ever includes another app on a jailbroken device reading it.
 */
const TOKEN_KEY = 'a3.token';

let sessionToken: string | null = null;
let restored: Promise<void> | null = null;

export const token = {
  get: (): string | null => sessionToken,

  set: (t: string | null): void => {
    sessionToken = t;
    // Fire-and-forget: the in-memory value is already correct, and a failed
    // write costs the driver one sign-in rather than breaking this request.
    const write = t
      ? AsyncStorage.setItem(TOKEN_KEY, t)
      : AsyncStorage.removeItem(TOKEN_KEY);
    write.catch(() => {});
  },

  /**
   * Hydrate from storage. Idempotent — the splash awaits this before deciding
   * between the tabs and the login screen, and every caller shares the one
   * promise so a second call cannot race the first.
   */
  restore: (): Promise<void> =>
    (restored ??= AsyncStorage.getItem(TOKEN_KEY)
      .then(t => {
        if (t) sessionToken = t;
      })
      .catch(() => {})),
};

/**
 * Fired when the server says this session is over — an expired or revoked
 * token, or an account that has been deactivated.
 *
 * This file cannot import the navigator (the repos it serves are imported by
 * every screen), so it announces instead and `RootNavigator` resets to the
 * auth stack.
 */
type SessionEndedHandler = (reason: string) => void;
const sessionEndedHandlers = new Set<SessionEndedHandler>();

export function onSessionEnded(fn: SessionEndedHandler): () => void {
  sessionEndedHandlers.add(fn);
  return () => {
    sessionEndedHandlers.delete(fn);
  };
}

/** What the API's errors.ts puts on the wire. */
interface ApiErrorBody {
  code?: string;
  message?: string;
  field?: 'email' | 'password';
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** The codes M2-error and M3 render against a field rather than in a toast. */
const AUTH_CODES = new Set<string>([
  'invalid_credentials',
  'password_too_short',
  'unknown_email',
  'network',
]);

export async function api<T>(
  path: string,
  init: {method?: string; body?: unknown} = {},
): Promise<T> {
  const t = token.get();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body === undefined
          ? {}
          : {'content-type': 'application/json'}),
        ...(t ? {authorization: `Bearer ${t}`} : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    // A driver in a yard with no signal is the common case, not the edge one.
    throw new AuthError(
      'network',
      'Cannot reach the server. Check your connection.',
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const body: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const e = body as ApiErrorBody;
    const code = e.code ?? 'error';
    const message = e.message ?? `Request failed (${res.status}).`;

    // A dead session on ANY call, not just the next cold start. A driver
    // whose token was revoked mid-shift should land on the login screen, not
    // stare at an error on every tab until they force-quit the app.
    //
    // 401 alone is not enough and 403 alone is too much: a role refusal is
    // also a 403 and must leave the driver exactly where they are.
    if (res.status === 401 || code === 'inactive_account') {
      // A wrong password on the login screen is not an expired session.
      if (!path.startsWith('/auth/login')) {
        token.set(null);
        sessionEndedHandlers.forEach(fn => fn(message));
      }
    }
    if (AUTH_CODES.has(code)) {
      throw new AuthError(code as AuthErrorCode, message, e.field);
    }
    throw new ApiError(res.status, code, message);
  }

  return body as T;
}

/**
 * A 404 is an answer, not a failure.
 *
 * Every `get(id)` in the contracts returns `T | null`, but a bare `api()` call
 * throws on 404 — so "no such job" arrived at the screens as an error and took
 * the whole view down with it. Wrap the lookups; keep throwing for everything
 * else, because a 500 is not "not found".
 */
export async function maybe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      return null;
    }
    throw e;
  }
}
