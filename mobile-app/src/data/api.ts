import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthError, type AuthErrorCode } from './contracts';

export const API_URL = 'https://backend.a3tranz.appcrops.com';

const TOKEN_KEY = 'a3.token';

let sessionToken: string | null = null;
let restored: Promise<void> | null = null;

export const token = {
  get: (): string | null => sessionToken,

  set: (t: string | null): void => {
    sessionToken = t;
    const write = t
      ? AsyncStorage.setItem(TOKEN_KEY, t)
      : AsyncStorage.removeItem(TOKEN_KEY);
    write.catch(() => {});
  },

  restore: (): Promise<void> =>
    (restored ??= AsyncStorage.getItem(TOKEN_KEY)
      .then(t => {
        if (t) sessionToken = t;
      })
      .catch(() => {})),
};

type SessionEndedHandler = (reason: string) => void;
const sessionEndedHandlers = new Set<SessionEndedHandler>();

export function onSessionEnded(fn: SessionEndedHandler): () => void {
  sessionEndedHandlers.add(fn);
  return () => {
    sessionEndedHandlers.delete(fn);
  };
}

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

    if (res.status === 401 || code === 'inactive_account') {
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
