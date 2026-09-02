import type { DriversRepo } from '../contracts';
import { clone, db, delay, MockError, unreadNotificationCount } from './db';

export const mockDriversRepo: DriversRepo = {
  async me() {
    await delay();
    const id = db.session?.driverId ?? db.credentials.driverId;
    const driver = db.drivers.find(d => d.id === id);
    if (!driver) {
      throw new MockError('Not signed in.');
    }
    return clone(driver);
  },

  async overview() {
    await delay();
    // The bell badge is the SAME derivation as the Alerts tab dot and M14's
    // list (§6.8). The fixture's own `unreadNotifications` is a frozen 7 that
    // the notification rows never reproduce — deriving it keeps the header
    // honest the moment a driver reads one.
    return {
      ...clone(db.homeOverview),
      unreadNotifications: unreadNotificationCount(),
    };
  },

  async get(id) {
    await delay();
    const driver = db.drivers.find(d => d.id === id);
    return driver ? clone(driver) : null;
  },

  async list() {
    await delay();
    return db.drivers.map(clone);
  },

  async changePassword(current, next) {
    await delay();
    if (current !== db.credentials.password) {
      throw new MockError('Current password is incorrect.');
    }
    if (next.trim().length < 8) {
      throw new MockError('New password must be at least 8 characters.');
    }
    db.credentials.password = next;
  },
};
