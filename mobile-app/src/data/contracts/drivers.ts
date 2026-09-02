export interface Driver {
  id: string;
  name: string;
  initials: string;
  email: string;
  /** 'Driver' — the sixth, mobile-only role (§6.6). */
  role: string;
  base: string;
  active: boolean;
  jobsCompleted: number;
}

/**
 * M18's header + overview grid in one read. `doneThisWeek` is the only value
 * here that is not derivable from the job list, so the whole card reads from
 * one source rather than half-deriving and half-fetching.
 */
export interface DriverOverview {
  /** `.home-date` — 'Tuesday · 25 November' */
  dateLabel: string;
  /** `.home-greet` — 'Morning, John' */
  greeting: string;
  unreadNotifications: number;
  /** The job rendered under "Up next", or null when there is nothing queued. */
  upNextJobId: string | null;
  pending: number;
  inProgress: number;
  doneThisWeek: number;
  overdue: number;
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
}
