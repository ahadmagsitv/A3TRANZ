import type { CustomersRepo } from '../contracts';
import { clone, db, delay } from './db';

export const mockCustomersRepo: CustomersRepo = {
  async list() {
    await delay();
    return db.customers.map(clone);
  },
  async get(id) {
    await delay();
    const customer = db.customers.find(c => c.id === id);
    return customer ? clone(customer) : null;
  },
};
