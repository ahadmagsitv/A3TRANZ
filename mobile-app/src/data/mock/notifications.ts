import type { NotificationsRepo } from '../contracts';
import { clone, db, delay, notifyMock, unreadNotificationCount } from './db';

export const mockNotificationsRepo: NotificationsRepo = {
  async list() {
    await delay();
    return db.notifications.map(clone);
  },

  /** One derived selector — the Alerts tab dot and M18's bell read this. */
  async unreadCount() {
    await delay();
    return unreadNotificationCount();
  },

  async markRead(id) {
    await delay();
    const notification = db.notifications.find(n => n.id === id);
    if (notification && !notification.read) {
      notification.read = true;
      notifyMock();
    }
  },

  async markAllRead() {
    await delay();
    if (!db.notifications.some(n => !n.read)) {
      return;
    }
    db.notifications.forEach(n => {
      n.read = true;
    });
    notifyMock();
  },

  async getPrefs() {
    await delay();
    return { ...db.notificationPrefs };
  },

  async setPref(kind, enabled) {
    await delay();
    db.notificationPrefs[kind] = enabled;
  },
};
