export interface Driver {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string | null;
  /** 'Driver' — the sixth, mobile-only role (§6.6). */
  role: string;
  /** Home terminal. admin called this `city` (§R-D2). */
  base: string;
  /** admin exposed a 2-state `status`; this is the stored truth (§R-D1). */
  active: boolean;
  joinedAt: string | null;
  lastActiveAt: string | null;
  jobsCompleted: number;
  jobsInProgress: number;
  jobsOverdue: number;
}

/**
 * M18's header + overview grid in one read. `doneThisWeek` is the only value
 * here not derivable from the job list, so the card reads from one source
 * rather than half-deriving and half-fetching.
 */
export interface DriverOverview {
  /** `.home-date` — 'Tuesday · 25 November' */
  dateLabel: string;
  /** `.home-greet` — 'Morning, John' */
  greeting: string;
  unreadNotifications: number;
  /** The job rendered under "Up next". Null when there is none. */
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
  /** The signed-in driver. M15 Profile. */
  me(): Promise<Driver>;
  /** M18 Home — greeting, badge and the four `.stat` counts. */
  overview(): Promise<DriverOverview>;
  get(id: string): Promise<Driver | null>;
  list(): Promise<Driver[]>;
  /** M16. Throws on a wrong current password or a new password under 8 chars. */
  changePassword(current: string, next: string): Promise<void>;
  /** W9 — drivers are added by an admin, never self-registered. */
  add(input: DriverInput): Promise<Driver>;
  deactivate(id: string): Promise<Driver>;
}

/* §R-D1 · `active: boolean` (mobile) beats `status: 'active'|'inactive'`
 *         (admin) — one bit, and admin's tag renders from it unchanged.
 * §R-D2 · admin `city` → `base`. Same value, mobile's name.
 * §R-D3 · admin's jobsInProgress / jobsOverdue kept: W7's list columns. */
