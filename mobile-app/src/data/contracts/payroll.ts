export type PayPeriodStatus = 'accruing' | 'held' | 'paid';

export interface PayLine {
  jobId: string;
  leg: string;
  amount: number;
}

export interface PayPeriod {
  id: string;
  driverId: string;
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
  thisWeekPaysOnLabel: string;
  holdRule: string;
}

export interface PayrollRepo {
  summary(driverId: string): Promise<EarningsSummary>;
  periods(driverId: string, status?: 'pending' | 'paid'): Promise<PayPeriod[]>;
  period(id: string): Promise<PayPeriod | null>;
}
