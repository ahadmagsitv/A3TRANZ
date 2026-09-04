/**
 * Auth against the API (BACKEND_PLAN Phase 1).
 *
 * `authStore` stays: the shell reads the signed-in user synchronously and the
 * server is not going to be asked on every render. The token is the thing that
 * actually authenticates — the store is a cache of who it belongs to.
 */
import type { AuthRepo, AuthUser, NewMember, TeamMember } from "@/data/contracts/auth";
import { api, onSessionEnded, token } from "./api";
import { createStore } from "./store";

export const authStore = createStore<AuthUser | null>(null);

/**
 * Why the last session ended, for the login screen to say out loud.
 *
 * Being deactivated mid-session logs you out on the very next request. Without
 * this the server's reason — "This account is no longer active. Contact
 * dispatch." — is thrown away at the api client and the user lands on a blank
 * sign-in form with no idea why, tries their correct password, and is told
 * only that the account is inactive on the second go. The reason is already
 * on the wire; this stops dropping it.
 */
export const sessionEndedStore = createStore<string | null>(null);

/**
 * Any request that comes back "your session is over" empties the store, and
 * `AuthGate` follows the store to /login. Registered once, at module load, so
 * it is live for every screen rather than whichever one happens to be mounted.
 */
onSessionEnded(reason => {
  authStore.set(null);
  sessionEndedStore.set(reason);
});

export const authRepo: AuthRepo = {
  async login(email: string, password: string, remember = true): Promise<AuthUser> {
    const { token: t, user } = await api<{ token: string; user: AuthUser }>(
      "/auth/login",
      { method: "POST", body: { email, password } },
    );
    token.set(t, remember);
    authStore.set(user);
    // Whatever ended the last session is history the moment a new one starts.
    sessionEndedStore.set(null);
    return user;
  },

  async requestReset(email: string): Promise<{ sentTo: string; expiryLabel: string }> {
    return api<{ sentTo: string; expiryLabel: string }>("/auth/reset-request", {
      method: "POST",
      body: { email },
    });
  },

  async resetPassword(resetToken: string, password: string): Promise<void> {
    await api<{ ok: boolean }>("/auth/reset", {
      method: "POST",
      body: { token: resetToken, password },
    });
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

  async list(): Promise<TeamMember[]> {
    const { users } = await api<{ users: TeamMember[] }>("/auth/team");
    return users;
  },

  async add(input: NewMember): Promise<TeamMember> {
    const { user } = await api<{ user: TeamMember }>("/auth/team", {
      method: "POST",
      body: input,
    });
    return user;
  },

  async update(id, patch): Promise<TeamMember> {
    const { user } = await api<{ user: TeamMember }>(`/auth/team/${id}`, {
      method: "PATCH",
      body: patch,
    });
    return user;
  },

  async remove(id: string): Promise<void> {
    await api<void>(`/auth/team/${id}`, { method: "DELETE" });
  },
};
