export type DriverStatus = "active" | "inactive";

export interface Driver {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  status: DriverStatus;
  city: string;
  joinedAt: string;
  jobsCompleted: number;
  jobsInProgress: number;
  jobsOverdue: number;
  lastActiveAt: string;
}

export interface DriverInput {
  name: string;
  email: string;
  phone: string;
  base: string;
  /**
   * Set by the admin and told to the driver directly, standing in until
   * invite emails send. The invite link is issued regardless, so the driver
   * can replace this with a password only they know.
   */
  tempPassword: string;
  /** Inactive drivers cannot sign in until an admin activates them. */
  active: boolean;
}

export interface DriversRepo {
  list(): Promise<Driver[]>;
  get(id: string): Promise<Driver | null>;
  add(input: DriverInput): Promise<Driver>;
  deactivate(id: string): Promise<Driver>;
  /** W8 — puts a stood-down driver back on the road. */
  activate(id: string): Promise<Driver>;
  update(id: string, patch: Pick<DriverInput, "name" | "email" | "phone" | "base">): Promise<Driver>;
  /** 409 when the driver has history — deactivate instead. */
  remove(id: string): Promise<void>;
}
