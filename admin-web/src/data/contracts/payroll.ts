export type PayPeriodStatus = "accruing" | "held" | "payable" | "paid";

export interface PayLine {
  jobId: string;
  jobTitle: string;
  legLabel: string;
  amount: number;
}

export interface PayGroup {
  driverId: string;
  amount: number;
  lines: PayLine[];
  moreLegsCount: number;
  moreLegsAmount: number;
}

export interface PayPeriod {
  id: string;
  label: string;
  isCurrent: boolean;
  closesAt: string;
  paysAt: string;
  driverCount: number;
  legCount: number;
  amount: number;
  status: PayPeriodStatus;
  reference?: string;
  paidAt?: string;
  groups: PayGroup[];
}

export interface PayrollRepo {
  list(): Promise<PayPeriod[]>;
  get(id: string): Promise<PayPeriod | null>;
  updateLineAmount(
    periodId: string,
    driverId: string,
    jobId: string,
    legLabel: string,
    amount: number
  ): Promise<PayPeriod>;
  markPaid(id: string, reference: string, paidAt: string): Promise<PayPeriod>;
}
