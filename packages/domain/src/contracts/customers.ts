export interface Customer {
  id: string;
  name: string;
  /** The short form the job cards render in `.jcard-meta`. */
  shortName: string;
  email: string | null;
  contactName: string | null;
  phone: string | null;
  /** Per-customer completion-email opt-in (W15/W16). Read-only on mobile. */
  notifyOnCompletion: boolean;
  customerSince: string | null;
  /** Derived counters for W14's list. */
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

/* §R-C1 · admin spelled it `notifyOnComplete`, mobile `notifyOnCompletion`.
 *         Mobile's wins. This flag gates the §6 outbox send. */
