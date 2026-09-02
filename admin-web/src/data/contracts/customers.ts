export interface Customer {
  id: string;
  name: string;
  email: string;
  contactName: string;
  phone: string;
  activeJobs: number;
  lastJobAt: string;
  notifyOnComplete: boolean;
  customerSince: string;
}

export interface CustomerInput {
  name: string;
  email: string;
  contactName: string;
  phone: string;
}

export interface CustomersRepo {
  list(): Promise<Customer[]>;
  get(id: string): Promise<Customer | null>;
  add(input: CustomerInput): Promise<Customer>;
  update(id: string, patch: Partial<Customer>): Promise<Customer>;
}
