export type Role =
  | "admin"
  | "manager"
  | "assistant_manager"
  | "project_manager"
  | "dispatcher"
  | "driver";

export interface AuthUser {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
}

export interface TeamMember extends AuthUser {
  active: boolean;
}

export interface NewMember {
  name: string;
  email: string;
  role: Exclude<Role, "driver">;
  tempPassword: string;
}

export interface AuthRepo {
  login(email: string, password: string, remember?: boolean): Promise<AuthUser>;
  requestReset(email: string): Promise<{ sentTo: string; expiryLabel: string }>;
  resetPassword(token: string, password: string): Promise<void>;
  logout(): Promise<void>;
  currentUser(): Promise<AuthUser | null>;
  list(): Promise<TeamMember[]>;
  add(input: NewMember): Promise<TeamMember>;
  update(id: string, patch: Partial<Omit<NewMember, "tempPassword">> & { active?: boolean }): Promise<TeamMember>;
  remove(id: string): Promise<void>;
}
