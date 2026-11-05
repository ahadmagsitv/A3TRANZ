import { AuthError, type AuthErrorCode } from "@a3/domain";

export const BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://backend.a3tranz.appcrops.com";

const TOKEN_KEY = "a3.token";

export const token = {
  get: (): string | null =>
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(TOKEN_KEY) ?? window.sessionStorage.getItem(TOKEN_KEY),
  set: (t: string | null, remember = true): void => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(TOKEN_KEY);
    if (t) (remember ? window.localStorage : window.sessionStorage).setItem(TOKEN_KEY, t);
  },
};

interface ApiErrorBody {
  code?: string;
  message?: string;
  field?: "email" | "password";
}

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
    throw new AuthError("network", "Cannot reach the server. Check your connection.");
  }

  if (res.status === 204) return undefined as T;

  const body: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const e = body as ApiErrorBody;
    const code = e.code ?? "error";
    const message = e.message ?? `Request failed (${res.status}).`;

    if (res.status === 401 || code === "inactive_account") {
      if (!path.startsWith("/auth/login")) {
        token.set(null);
        sessionEndedHandlers.forEach((fn) => fn(message));
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
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function uploadFile(
  file: File,
  meta:
    | { jobId: string; purpose: "attachment" | "job_photo" }
    | { threadId: string; purpose: "message" },
): Promise<{ key: string; name: string; sizeBytes: number; kind: "document" | "photo" }> {
  const { key, url, fields } = await api<{
    key: string;
    url: string;
    fields: Record<string, string>;
  }>("/uploads/presign", {
    method: "POST",
    body: {
      ...("jobId" in meta ? { jobId: meta.jobId } : { threadId: meta.threadId }),
      purpose: meta.purpose,
      contentType: file.type,
      contentLength: file.size,
    },
  });

  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", file);

  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    const why = await res
      .json()
      .then((b: { error?: { message?: string } }) => b.error?.message)
      .catch(() => undefined);
    throw new ApiError(res.status, "upload_failed", `Could not upload ${file.name}${why ? `: ${why}` : "."}`);
  }

  return {
    key,
    name: file.name,
    sizeBytes: file.size,
    kind: file.type.startsWith("image/") ? "photo" : "document",
  };
}
