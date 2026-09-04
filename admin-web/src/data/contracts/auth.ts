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

/** A row in the W13 members table. `active` is the one thing the roster
 * carries that the signed-in user does not — you are, by definition, active. */
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
  /** `remember` false keeps the token in sessionStorage — gone with the tab. */
  login(email: string, password: string, remember?: boolean): Promise<AuthUser>;
  /**
   * Always resolves, whether or not the email is on file: telling a stranger
   * which addresses have accounts is the one thing this flow must not do. The
   * copy comes back from the server so both ends cannot word it differently.
   */
  requestReset(email: string): Promise<{ sentTo: string; expiryLabel: string }>;
  /** Redeem the link from that email. Signs every existing session out. */
  resetPassword(token: string, password: string): Promise<void>;
  logout(): Promise<void>;
  currentUser(): Promise<AuthUser | null>;
  // web only — W13 team members table (task W-12). Inactive members included:
  // this is the screen that puts them back.
  list(): Promise<TeamMember[]>;
  // web only — W13 "Add member". Office roles only; `driver` is not one of
  // them, and the API refuses it too.
  add(input: NewMember): Promise<TeamMember>;
  // web only — W13 row menu. Edit, deactivate and reactivate are one call:
  // the server treats them as the same update.
  update(id: string, patch: Partial<Omit<NewMember, "tempPassword">> & { active?: boolean }): Promise<TeamMember>;
  remove(id: string): Promise<void>;
}
