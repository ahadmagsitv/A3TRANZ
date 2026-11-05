export type PayPeriodStatus = 'accruing' | 'held' | 'payable' | 'paid';

export interface PayLine {
  jobId: string;
  jobTitle: string;
  legLabel: string;
  amount: number;
}

export interface PayGroup {
  driverId: string;
  driverName: string;
  amount: number;
  legCount: number;
  lines: PayLine[];
  moreLegsCount: number;
  moreLegsAmount: number;
}

export interface PayPeriod {
  id: string;
  label: string;
  isCurrent: boolean;
  status: PayPeriodStatus;
  closesAt: string;
  paysAt: string;
  driverCount: number;
  legCount: number;
  amount: number;
  reference: string | null;
  paidAt: string | null;
  method: string | null;
  groups: PayGroup[];
}

export interface DriverPayPeriod {
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
  driverPeriods(
    driverId: string,
    status?: 'pending' | 'paid',
  ): Promise<DriverPayPeriod[]>;
  driverPeriod(id: string, driverId: string): Promise<DriverPayPeriod | null>;
  list(): Promise<PayPeriod[]>;
  get(id: string): Promise<PayPeriod | null>;
  updateLineAmount(
    periodId: string,
    driverId: string,
    jobId: string,
    legLabel: string,
    amount: number,
  ): Promise<PayPeriod>;
  markPaid(id: string, reference: string, paidAt: string): Promise<PayPeriod>;
}

