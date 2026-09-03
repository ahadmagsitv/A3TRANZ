import {AuthError, type AuthRepo, type Driver, type Session} from '../contracts';
import {ApiError, api, token} from '../api';
import {clearBadges} from './badges';
import {startPush, stopPush} from '../../push';

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
    try {
      const {driver} = await api<{driver: Driver}>('/drivers/me');
      // After the session exists — a device token registered before it would
      // have no account to belong to.
      void startPush();
      return {driver, token: t};
    } catch (e) {
      // Credentials were right, so the token is real — but this app only
      // renders a driver, and /drivers/me is 404 for an office account.
      // Drop the token rather than leave the app holding one for an account
      // it cannot show, and say which app they want.
      token.set(null);
      if (e instanceof ApiError && e.status === 404) {
        throw new AuthError(
          'not_a_driver',
          'This app is for drivers. Office accounts use the admin site.',
        );
      }
      throw e;
    }
  },

  async signOut(): Promise<void> {
    // Before the token goes: unregistering needs the session it belongs to.
    await stopPush();
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
      // A restored session is still a session — the token may have rotated
      // while the app was closed.
      void startPush();
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
