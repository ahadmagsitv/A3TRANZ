export interface Customer {
  id: string;
  name: string;
  /** The short form the job cards render in `.jcard-meta`. */
  shortName: string;
  /** Per-customer completion-email opt-in (W15/W16). Read-only on mobile. */
  notifyOnCompletion: boolean;
}

export interface CustomersRepo {
  list(): Promise<Customer[]>;
  get(id: string): Promise<Customer | null>;
}
