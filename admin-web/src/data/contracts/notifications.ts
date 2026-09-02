export interface Notification {
  id: string;
  title: string;
  message: string;
  icon: string;
  at: string;
  read: boolean;
  jobId?: string;
}

export interface NotificationsRepo {
  list(): Promise<Notification[]>;
  markRead(id: string): Promise<void>;
  unreadCount(): Promise<number>;
}
