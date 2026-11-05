export type Role =
  | 'admin'
  | 'manager'
  | 'assistant_manager'
  | 'project_manager'
  | 'dispatcher'
  | 'driver';

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
  refreshToken: string;
}

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'password_too_short'
  | 'unknown_email'
  | 'inactive_account'
  | 'network';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly field: 'email' | 'password' | undefined;

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
  requestReset(email: string): Promise<{ sentTo: string; expiryLabel: string }>;
  redeemReset(token: string, password: string): Promise<void>;
  listTeam(): Promise<AuthUser[]>;
}

