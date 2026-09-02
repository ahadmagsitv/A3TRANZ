/** A period accrues, is held one week, then pays the following Friday. */
export type PayPeriodStatus = 'accruing' | 'held' | 'paid';

export interface PayLine {
  jobId: string;
  /** 'Pickup' | 'Loading' | 'Delivery' as rendered in `.legrow`. */
  leg: string;
  amount: number;
}

export interface PayPeriod {
  id: string;
  driverId: string;
  /** 'Nov 10 – Nov 16' */
  label: string;
  subLabel: string;
  status: PayPeriodStatus;
  legCount: number;
  total: number;
  paysOnLabel: string | null;
  paidOnLabel: string | null;
  reference: string | null;
  method: string | null;
  lines: PayLine[];
  /** M25 renders '+ 21 more legs' rather than every line. */
  remainingLegCount: number;
  remainingTotal: number;
}

export interface EarningsSummary {
  driverId: string;
  pendingPeriodCount: number;
  pendingLegCount: number;
  pendingTotal: number;
  nextPaymentLabel: string;
  paidPeriodCount: number;
  paidTotal: number;
  lastPaymentLabel: string;
  lastPaymentReference: string;
  thisWeekLabel: string;
  thisWeekTotal: number;
  thisWeekLegCount: number;
  /**
   * M18's earnings card — 'Fri, Dec 05'. NOT `nextPaymentLabel`: that is when
   * the already-closed periods pay, this is when the week currently accruing
   * will pay once it closes on Sunday.
   */
  thisWeekPaysOnLabel: string;
  /** Rendered literally in an info toast on both M24 tabs (§4). */
  holdRule: string;
}

export interface PayrollRepo {
  summary(driverId: string): Promise<EarningsSummary>;
  /** Omit `status` for every period. 'pending' = accruing + held. */
  periods(driverId: string, status?: 'pending' | 'paid'): Promise<PayPeriod[]>;
  period(id: string): Promise<PayPeriod | null>;
}
