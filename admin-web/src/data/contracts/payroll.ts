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
  /** Remaining legs not itemised individually (gallery's "+ N more legs" row). */
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
  /** Set by markPaid — the ledger's "paid" date (plan §7.3: Paid = date + reference no.). */
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
  /** Records that a payment happened elsewhere (plan §7.3 — a ledger, never a
   * transaction). Moves no money, collects no bank/card details. */
  markPaid(id: string, reference: string, paidAt: string): Promise<PayPeriod>;
}
