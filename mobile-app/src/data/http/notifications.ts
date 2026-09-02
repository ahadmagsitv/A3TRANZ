import type {
  AppNotification,
  NotificationKind,
  NotificationPrefs,
  NotificationsRepo,
} from '../contracts';
import {api} from '../api';
import {setAlertsUnread} from './badges';

export const httpNotificationsRepo: NotificationsRepo = {
  async list(): Promise<AppNotification[]> {
    const {notifications} = await api<{notifications: AppNotification[]}>(
      '/notifications',
    );
    // The list is the authority on the dot while it is on screen.
    setAlertsUnread(notifications.some(n => !n.read));
    return notifications;
  },

  async unreadCount(): Promise<number> {
    const {count} = await api<{count: number}>('/notifications/unread');
    setAlertsUnread(count > 0);
    return count;
  },

  async markRead(id: string): Promise<void> {
    await api<void>(`/notifications/${id}/read`, {method: 'POST'});
    const {count} = await api<{count: number}>('/notifications/unread');
    setAlertsUnread(count > 0);
  },

  async markAllRead(): Promise<void> {
    await api<void>('/notifications/read-all', {method: 'POST'});
    setAlertsUnread(false);
  },

  async getPrefs(): Promise<NotificationPrefs> {
    const {prefs} = await api<{prefs: NotificationPrefs}>('/notifications/prefs');
    return prefs;
  },

  async setPref(kind: NotificationKind, enabled: boolean): Promise<void> {
    await api<void>(`/notifications/prefs/${kind}`, {
      method: 'PUT',
      body: {enabled},
    });
  },
};
