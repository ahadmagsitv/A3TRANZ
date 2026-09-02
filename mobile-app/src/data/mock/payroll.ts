import type { PayrollRepo } from '../contracts';
import { clone, db, delay } from './db';

export const mockPayrollRepo: PayrollRepo = {
  async summary(driverId) {
    await delay();
    return { ...clone(db.earningsSummary), driverId };
  },

  async periods(driverId, status) {
    await delay();
    return db.payPeriods
      .filter(p => p.driverId === driverId)
      .filter(p =>
        status === undefined
          ? true
          : status === 'paid'
          ? p.status === 'paid'
          : p.status !== 'paid',
      )
      .map(clone);
  },

  async period(id) {
    await delay();
    const period = db.payPeriods.find(p => p.id === id);
    return period ? clone(period) : null;
  },
};
