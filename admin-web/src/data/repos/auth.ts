import type { AuthRepo, AuthUser, NewMember, TeamMember } from "@/data/contracts/auth";
import { api, onSessionEnded, token } from "./api";
import { createStore } from "./store";

export const authStore = createStore<AuthUser | null>(null);

export const sessionEndedStore = createStore<string | null>(null);

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
    try {
      await api<void>("/auth/logout", { method: "POST" });
    } finally {
      token.set(null);
      authStore.set(null);
    }
  },

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
