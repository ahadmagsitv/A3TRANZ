import type {AuthRepo, Driver, Session} from '../contracts';
import {api, token} from '../api';
import {clearBadges} from './badges';

export const httpAuthRepo: AuthRepo = {
  async signIn(email: string, password: string): Promise<Session> {
    const {token: t} = await api<{token: string; user: {id: string}}>(
      '/auth/login',
      {method: 'POST', body: {email, password}},
    );
    token.set(t);
    // The login response carries the auth user, not the driver record M15
    // renders. One extra read here keeps `Session.driver` a real Driver
    // rather than a half-populated one every profile screen has to top up.
    const {driver} = await api<{driver: Driver}>('/drivers/me');
    return {driver, token: t};
  },

  async signOut(): Promise<void> {
    try {
      await api<void>('/auth/logout', {method: 'POST'});
    } finally {
      // Local state clears even if the call failed: the driver asked to sign
      // out, and a dead network must not leave them looking signed in.
      token.set(null);
      clearBadges();
    }
  },

  async current(): Promise<Session | null> {
    // The splash calls this before routing, so this is where a token written
    // on a previous launch comes back.
    await token.restore();
    const t = token.get();
    if (!t) {
      return null;
    }
    try {
      const {driver} = await api<{driver: Driver}>('/drivers/me');
      return {driver, token: t};
    } catch {
      token.set(null);
      return null;
    }
  },

  async requestReset(email: string): Promise<{sentTo: string; expiryLabel: string}> {
    return api<{sentTo: string; expiryLabel: string}>('/auth/reset-request', {
      method: 'POST',
      body: {email},
    });
  },
};
