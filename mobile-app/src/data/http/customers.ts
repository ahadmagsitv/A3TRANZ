import type {Customer, CustomersRepo} from '../contracts';
import {api, maybe} from '../api';

/**
 * Office-only server-side (a driver token gets 403), and no mobile screen
 * calls it — the customer name travels on the job. Implemented because the
 * contract declares it, not because anything on this app reads it.
 */
export const httpCustomersRepo: CustomersRepo = {
  async list(): Promise<Customer[]> {
    const {customers} = await api<{customers: Customer[]}>('/customers');
    return customers;
  },

  async get(id: string): Promise<Customer | null> {
    const r = await maybe(api<{customer: Customer}>(`/customers/${id}`));
    return r ? r.customer : null;
  },
};
