/** Six roles. Five office labels + a mobile-only 'driver' (plan §6.6). */
export type Role =
  | 'admin'
  | 'manager'
  | 'assistant_manager'
  | 'project_manager'
  | 'dispatcher'
  | 'driver';

/**
 * One user table, six roles (§R-A1). A driver is a user whose role is
 * 'driver'; the office roles are the other five. Two tables would have meant
 * two login paths for one login form.
 */
export interface AuthUser {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
}

export interface Session {
  user: AuthUser;
  token: string;
  /** Opaque; exchanged at /auth/refresh. */
  refreshToken: string;
}

/**
 * Every failure a screen must render is a distinct code, so M2-error and
 * W1-error stay reachable without hand-placing them (§2.3).
 */
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'password_too_short'
  | 'unknown_email'
  | 'inactive_account'
  | 'network';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  /** Set when the message belongs under a field rather than in a toast. */
  readonly field: 'email' | 'password' | undefined;

  // Plain fields, not constructor parameter properties: Node's type-stripping
  // runs this file directly and does not support the shorthand.
  constructor(
    code: AuthErrorCode,
    message: string,
    field?: 'email' | 'password',
  ) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.field = field;
  }
}

export interface AuthRepo {
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  current(): Promise<Session | null>;
  /** M3. Resolves with the copy M3-link-sent renders. */
  requestReset(email: string): Promise<{ sentTo: string; expiryLabel: string }>;
  /**
   * Redeem the link `requestReset` sent — and the W9 driver invite, which is
   * the same token with a longer life. Signs every existing session out.
   */
  redeemReset(token: string, password: string): Promise<void>;
  /** W13 team members table. Office roles only — never lists drivers. */
  listTeam(): Promise<AuthUser[]>;
}

/* §R-A1 · mobile had `Session { driver, token }`, admin had a bare `AuthUser`
 * with no session at all. Merged: `Session { user, token, refreshToken }`.
 * The mobile adapter reads `session.user` where it read `session.driver`. */
