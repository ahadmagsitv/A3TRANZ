// Five office role labels (plan §6.6) + a sixth, mobile-only "driver" role
// that never signs into admin-web but shares the Role type with the mock
// fixtures/state-machine story.
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

export interface NewMember {
  name: string;
  email: string;
  role: Exclude<Role, "driver">;
  tempPassword: string;
}

export interface AuthRepo {
  login(email: string, password: string): Promise<AuthUser>;
  logout(): Promise<void>;
  currentUser(): Promise<AuthUser | null>;
  // web only — W13 team members table (task W-12).
  list(): Promise<AuthUser[]>;
  // web only — W13 "Add member". Office roles only; `driver` is not one of
  // them, and the API refuses it too.
  add(input: NewMember): Promise<AuthUser>;
}
