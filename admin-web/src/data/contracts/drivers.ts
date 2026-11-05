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
  tempPassword: string;
  active: boolean;
}

export interface DriversRepo {
  list(): Promise<Driver[]>;
  get(id: string): Promise<Driver | null>;
  add(input: DriverInput): Promise<Driver>;
  deactivate(id: string): Promise<Driver>;
  activate(id: string): Promise<Driver>;
  update(id: string, patch: Pick<DriverInput, "name" | "email" | "phone" | "base">): Promise<Driver>;
  remove(id: string): Promise<void>;
}
