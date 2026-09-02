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
  /** 'Today' | 'Yesterday' — the `.sect-lbl` group header. */
  group: string;
  read: boolean;
}

/** M14's Notification settings row — one on/off per §6.8 driver trigger. */
export type NotificationPrefs = Record<NotificationKind, boolean>;

export interface NotificationsRepo {
  list(): Promise<AppNotification[]>;
  unreadCount(): Promise<number>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  getPrefs(): Promise<NotificationPrefs>;
  setPref(kind: NotificationKind, enabled: boolean): Promise<void>;
}
