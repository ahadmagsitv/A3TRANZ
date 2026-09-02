/** Driver-facing triggers, §6.8. Fired by the state machine, not by a screen. */
export type NotificationKind =
  | 'job_assigned'
  | 'job_updated'
  | 'message'
  | 'overdue'
  | 'approved'
  | 'period_paid'
  | 'unit_out_of_service';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  jobId: string | null;
  at: string;
  /** 'Today' | 'Yesterday' — the `.sect-lbl` group header. */
  group: string;
  read: boolean;
}

/** M14's Notification settings row — one on/off per §6.8 driver trigger. */
export type NotificationPrefs = Record<NotificationKind, boolean>;

/** The lucide glyph per trigger. admin stored `icon` per row (§R-N1). */
export const NOTIFICATION_ICON: Record<NotificationKind, string> = {
  job_assigned: 'Briefcase',
  job_updated: 'RefreshCw',
  message: 'MessageSquare',
  overdue: 'AlertTriangle',
  approved: 'CheckCircle2',
  period_paid: 'Banknote',
  unit_out_of_service: 'Wrench',
};

export interface NotificationsRepo {
  list(): Promise<AppNotification[]>;
  unreadCount(): Promise<number>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  getPrefs(): Promise<NotificationPrefs>;
  setPref(kind: NotificationKind, enabled: boolean): Promise<void>;
}

/* §R-N1 · admin stored `icon` as a string per notification row and had no
 *         `kind`. Kind wins — it is the §6.8 trigger taxonomy that drives
 *         prefs and the outbox. Icon is a lookup off it, not a column: a glyph
 *         change would otherwise need a data migration.
 * §R-N2 · admin `message` → `body`. admin had no prefs surface; drivers do. */
