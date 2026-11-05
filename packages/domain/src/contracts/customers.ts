export interface Customer {
  id: string;
  name: string;
  shortName: string;
  email: string | null;
  contactName: string | null;
  phone: string | null;
  notifyOnCompletion: boolean;
  customerSince: string | null;
  activeJobs: number;
  lastJobAt: string | null;
}

export interface CustomerInput {
  name: string;
  shortName: string;
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

