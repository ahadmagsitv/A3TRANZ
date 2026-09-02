/**
 * Auth against the API (BACKEND_PLAN Phase 1).
 *
 * `authStore` stays: the shell reads the signed-in user synchronously and the
 * server is not going to be asked on every render. The token is the thing that
 * actually authenticates — the store is a cache of who it belongs to.
 */
import type { AuthRepo, AuthUser } from "@/data/contracts/auth";
import { api, onSessionEnded, token } from "./api";
import { createStore } from "./store";

export const authStore = createStore<AuthUser | null>(null);

/**
 * Any request that comes back "your session is over" empties the store, and
 * `AuthGate` follows the store to /login. Registered once, at module load, so
 * it is live for every screen rather than whichever one happens to be mounted.
 */
onSessionEnded(() => authStore.set(null));

export const authRepo: AuthRepo = {
  async login(email: string, password: string): Promise<AuthUser> {
    const { token: t, user } = await api<{ token: string; user: AuthUser }>(
      "/auth/login",
      { method: "POST", body: { email, password } },
    );
    token.set(t);
    authStore.set(user);
    return user;
  },

  async logout(): Promise<void> {
    // Clear locally even if the call fails: the user asked to be signed out,
    // and a dead network must not leave them looking signed in. The API's
    // logout is unauthenticated for the same reason.
    try {
      await api<void>("/auth/logout", { method: "POST" });
    } finally {
      token.set(null);
      authStore.set(null);
    }
  },

  /**
   * Restores a session on reload. The mock could not do this — it kept the
   * user in memory, so a refresh always bounced to /login even with a valid
   * session. Anything other than a live token resolves to null.
   */
  async currentUser(): Promise<AuthUser | null> {
    if (!token.get()) return null;
    try {
      const { user } = await api<{ user: AuthUser }>("/auth/me");
      authStore.set(user);
      return user;
    } catch {
      token.set(null);
      authStore.set(null);
      return null;
    }
  },

  async list(): Promise<AuthUser[]> {
    const { users } = await api<{ users: AuthUser[] }>("/auth/team");
    return users;
  },
};
