export interface Driver {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string | null;
  role: string;
  base: string;
  active: boolean;
  joinedAt: string | null;
  lastActiveAt: string | null;
  jobsCompleted: number;
  jobsInProgress: number;
  jobsOverdue: number;
}

export interface DriverOverview {
  dateLabel: string;
  greeting: string;
  unreadNotifications: number;
  upNextJobId: string | null;
  pending: number;
  inProgress: number;
  doneThisWeek: number;
  overdue: number;
}

export interface DriverInput {
  name: string;
  email: string;
  phone: string;
  base: string;
}

export interface DriversRepo {
  me(): Promise<Driver>;
  overview(): Promise<DriverOverview>;
  get(id: string): Promise<Driver | null>;
  list(): Promise<Driver[]>;
  changePassword(current: string, next: string): Promise<void>;
  add(input: DriverInput): Promise<Driver>;
  deactivate(id: string): Promise<Driver>;
}

