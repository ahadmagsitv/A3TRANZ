/** A period accrues, is held one week, then pays the following Friday. */
export type PayPeriodStatus = 'accruing' | 'held' | 'payable' | 'paid';

export interface PayLine {
  jobId: string;
  jobTitle: string;
  /** 'Pickup' | 'Loading' | 'Delivery' as rendered in `.legrow`. */
  legLabel: string;
  /** Dollars. Integer cents in the DB (jobs.ts §R6). */
  amount: number;
}

/** One driver's slice of a company period. W20 renders these as `.paygrp`. */
export interface PayGroup {
  driverId: string;
  driverName: string;
  amount: number;
  legCount: number;
  lines: PayLine[];
  /** Legs not itemised individually — the "+ N more legs" row. */
  moreLegsCount: number;
  moreLegsAmount: number;
}

/**
 * THE canonical period: company-wide, every driver (§R-P1). W19/W20 read it
 * whole; the mobile app reads the projection below.
 */
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

/** One driver's view of one period — M24/M25. A projection, never a row. */
export interface DriverPayPeriod {
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
  /** M24/M25. 'pending' = accruing + held + payable. */
  summary(driverId: string): Promise<EarningsSummary>;
  driverPeriods(
    driverId: string,
    status?: 'pending' | 'paid',
  ): Promise<DriverPayPeriod[]>;
  driverPeriod(id: string, driverId: string): Promise<DriverPayPeriod | null>;
  /** W19/W20 — company-wide. */
  list(): Promise<PayPeriod[]>;
  get(id: string): Promise<PayPeriod | null>;
  /** W20 — amounts are editable HERE ONLY (web), never on mobile. */
  updateLineAmount(
    periodId: string,
    driverId: string,
    jobId: string,
    legLabel: string,
    amount: number,
  ): Promise<PayPeriod>;
  /** Records that a payment happened ELSEWHERE. Moves no money, collects no
   * bank or card details (plan §7.3 — a ledger, never a transaction). */
  markPaid(id: string, reference: string, paidAt: string): Promise<PayPeriod>;
}

/* §R-P1 · The two copies modelled different things and both were right about
 *         their own screen: mobile's PayPeriod is per-driver, admin's is
 *         company-wide with per-driver groups. A period is ONE company-wide
 *         row; the driver's is a projection of it. Hence two types, one table.
 *         Modelling it per-driver would have made W19's driverCount a sum over
 *         rows that could disagree.
 * §R-P2 · Status gains admin's 'payable' — mobile's 3-state could not say
 *         "held period has cleared its week and is ready to pay". */
