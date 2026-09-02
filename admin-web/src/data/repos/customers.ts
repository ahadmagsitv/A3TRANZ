import type { Customer, CustomerInput, CustomersRepo } from "@/data/contracts/customers";
import { api, maybe } from "./api";
import { dayLabel, monthYear } from "./format";

/** The API's customer, before this file reshapes it to what the tables read. */
interface ApiCustomer {
  id: string;
  name: string;
  email: string | null;
  contactName: string | null;
  phone: string | null;
  notifyOnCompletion: boolean;
  customerSince: string | null;
  activeJobs: number;
  lastJobAt: string | null;
}

// `notifyOnCompletion` on the wire, `notifyOnComplete` in the UI: the names
// were chosen independently and renaming either side is a wider change than
// mapping once, here.
const toCustomer = (c: ApiCustomer): Customer => ({
  id: c.id,
  name: c.name,
  email: c.email ?? "",
  contactName: c.contactName ?? "",
  phone: c.phone ?? "",
  activeJobs: c.activeJobs,
  lastJobAt: dayLabel(c.lastJobAt),
  notifyOnComplete: c.notifyOnCompletion,
  customerSince: monthYear(c.customerSince),
});

export const customersRepo: CustomersRepo = {
  async list(): Promise<Customer[]> {
    const { customers } = await api<{ customers: ApiCustomer[] }>("/customers");
    return customers.map(toCustomer);
  },

  async get(id: string): Promise<Customer | null> {
    const r = await maybe(api<{ customer: ApiCustomer }>(`/customers/${id}`));
    return r ? toCustomer(r.customer) : null;
  },

  async add(input: CustomerInput): Promise<Customer> {
    const { customer } = await api<{ customer: ApiCustomer }>("/customers", {
      method: "POST",
      body: input,
    });
    return toCustomer(customer);
  },

  async update(id: string, patch: Partial<Customer>): Promise<Customer> {
    const { customer } = await api<{ customer: ApiCustomer }>(`/customers/${id}`, {
      method: "PATCH",
      body: {
        name: patch.name,
        email: patch.email,
        contactName: patch.contactName,
        phone: patch.phone,
        notifyOnCompletion: patch.notifyOnComplete,
      },
    });
    return toCustomer(customer);
  },
};
