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
    try {
      const {driver} = await api<{driver: Driver}>('/drivers/me');
      void startPush();
      return {driver, token: t};
    } catch (e) {
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
    await stopPush();
    try {
      await api<void>('/auth/logout', {method: 'POST'});
    } finally {
      token.set(null);
      clearBadges();
    }
  },

  async current(): Promise<Session | null> {
    await token.restore();
    const t = token.get();
    if (!t) {
      return null;
    }
    try {
      const {driver} = await api<{driver: Driver}>('/drivers/me');
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
