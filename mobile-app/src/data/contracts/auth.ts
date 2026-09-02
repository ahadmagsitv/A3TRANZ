import type { Driver } from './drivers';

export interface Session {
  driver: Driver;
  token: string;
}

/**
 * Every failure a screen must render is a distinct code, so M2-error is
 * reachable from the mock rather than hand-placed (§2.3).
 */
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'password_too_short'
  | 'unknown_email'
  | 'network';

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
    /** Set when the message belongs under a field rather than in a toast. */
    public readonly field?: 'email' | 'password',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface AuthRepo {
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  current(): Promise<Session | null>;
  /** M3. Resolves with the copy M3-link-sent renders. */
  requestReset(email: string): Promise<{ sentTo: string; expiryLabel: string }>;
}
