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
  threadId: string | null;
  at: string;
  group: string;
  read: boolean;
}

export type NotificationPrefs = Record<NotificationKind, boolean>;

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

