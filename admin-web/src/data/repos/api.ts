/**
 * The one place that talks to the API.
 *
 * Every repo goes through `api()`. That keeps the base URL, the bearer token
 * and the error shape in a single file — the alternative is thirty fetch calls
 * that each guess at how the server reports a 403.
 */
import { AuthError, type AuthErrorCode } from "@a3/domain";

// The server, not localhost. NEXT_PUBLIC_* is inlined at BUILD time, so this
// fallback ships to real browsers whenever the build had no env set — and it
// did: the deployed bundle was telling every visitor to call their OWN
// machine on :4000. Override with NEXT_PUBLIC_API_URL (or a .env.local) to
// point a local build at a local API.
export const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://31.97.99.190:4001";

const TOKEN_KEY = "a3.token";

/**
 * The session token lives in web storage because this app is a static bundle
 * with no server of its own to hold a cookie — the API is a separate origin.
 * It is read on every call rather than cached in a module variable so a logout
 * in one tab is not still authenticated in another.
 *
 * WHICH storage is what "Remember me" actually decides. localStorage outlives
 * the browser; sessionStorage dies with the tab. That is the whole feature —
 * the server's session TTL is unchanged either way, so an unremembered login
 * is forgotten by this browser, not left alive somewhere else.
 */
export const token = {
  get: (): string | null =>
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(TOKEN_KEY) ?? window.sessionStorage.getItem(TOKEN_KEY),
  set: (t: string | null, remember = true): void => {
    if (typeof window === "undefined") return;
    // Always clear both first: signing in unremembered after a remembered
    // session must not leave the old token sitting in localStorage.
    window.localStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(TOKEN_KEY);
    if (t) (remember ? window.localStorage : window.sessionStorage).setItem(TOKEN_KEY, t);
  },
};

/** What the API's errors.ts puts on the wire. */
interface ApiErrorBody {
  code?: string;
  message?: string;
  field?: "email" | "password";
}

/**
 * Fired when the server says this session is over — an expired or revoked
 * token, or an account that has been deactivated.
 *
 * The api client cannot import the auth store (the auth repo already imports
 * this file), so it announces instead. `auth.ts` registers the handler that
 * clears the store, and the route guard follows the store to /login.
 */
type SessionEndedHandler = (reason: string) => void;
const sessionEndedHandlers = new Set<SessionEndedHandler>();

export function onSessionEnded(fn: SessionEndedHandler): () => void {
  sessionEndedHandlers.add(fn);
  return () => sessionEndedHandlers.delete(fn);
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const AUTH_CODES = new Set<string>([
  "invalid_credentials",
  "password_too_short",
  "unknown_email",
  "inactive_account",
  "network",
]);

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const t = token.get();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        ...(t ? { authorization: `Bearer ${t}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    // A dead network is the one failure the screens must not render as a
    // field error — it belongs in a toast, so it gets the contract's own code.
    throw new AuthError("network", "Cannot reach the server. Check your connection.");
  }

  if (res.status === 204) return undefined as T;

  const body: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const e = body as ApiErrorBody;
    const code = e.code ?? "error";
    const message = e.message ?? `Request failed (${res.status}).`;

    // A dead session on ANY call, not just the next reload. Signing in is the
    // only thing that fixes it, so send them there rather than rendering a
    // permission error on every panel until someone restarts the app.
    //
    // 401 alone is not enough and 403 alone is too much: a role refusal is
    // also a 403 and must leave the user exactly where they are.
    if (res.status === 401 || code === "inactive_account") {
      // `/auth/login` failing is not an expired session — it is a wrong
      // password on a screen that is already the login screen.
      if (!path.startsWith("/auth/login")) {
        token.set(null);
        sessionEndedHandlers.forEach((fn) => fn(message));
      }
    }
    // The four auth codes the login and reset screens render against fields
    // stay AuthError; everything else is a plain transport failure.
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
 * throws on 404 — so "no such record" reached the screens as an error. Wrap
 * the lookups; keep throwing for everything else, because a 500 is not
 * "not found".
 */
export async function maybe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/**
 * Put a file in the bucket and hand back the key.
 *
 * Three calls, not one: the server names the destination, the browser PUTs the
 * bytes straight there, and only the key comes back into a JSON route. That is
 * why a 40 MB PDF never touches this API, and why the client never holds
 * blanket write access to the bucket.
 */
export async function uploadFile(
  file: File,
  meta: { jobId: string; purpose: "attachment" | "job_photo" },
): Promise<{ key: string; name: string; sizeBytes: number; kind: "document" | "photo" }> {
  const { key, url, fields } = await api<{
    key: string;
    url: string;
    fields: Record<string, string>;
  }>("/uploads/presign", {
    method: "POST",
    body: {
      jobId: meta.jobId,
      purpose: meta.purpose,
      contentType: file.type,
      contentLength: file.size,
    },
  });

  // Multipart, because that is what Cloudinary's upload endpoint takes. The
  // signature and key come from the server; the browser only adds the bytes.
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", file);

  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    throw new ApiError(res.status, "upload_failed", `Could not upload ${file.name}.`);
  }

  return {
    key,
    name: file.name,
    sizeBytes: file.size,
    kind: file.type.startsWith("image/") ? "photo" : "document",
  };
}
