export interface Customer {
  id: string;
  name: string;
  shortName: string;
  notifyOnCompletion: boolean;
}

export interface CustomersRepo {
  list(): Promise<Customer[]>;
  get(id: string): Promise<Customer | null>;
}
