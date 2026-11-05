import type {Customer, CustomersRepo} from '../contracts';
import {api, maybe} from '../api';

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
