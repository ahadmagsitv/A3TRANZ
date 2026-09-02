import type {
  EarningsSummary,
  PayPeriod,
  PayrollRepo,
} from '../contracts';
import {api, maybe} from '../api';

interface ApiLine {
  jobId: string;
  jobTitle: string;
  legLabel: string;
  amount: number;
}

interface ApiPeriod extends Omit<PayPeriod, 'lines' | 'remainingLegCount' | 'remainingTotal'> {
  lines: ApiLine[];
}

/**
 * M25 renders a few leg lines and then "+ N more legs". The API sends the
 * lines it has and the period's own `legCount`, so the remainder is the
 * difference — derived here rather than asked for, because the two numbers
 * would then be able to disagree.
 */
const toPeriod = (p: ApiPeriod): PayPeriod => {
  const lines = p.lines.map(l => ({
    jobId: l.jobId,
    leg: l.legLabel,
    amount: l.amount,
  }));
  const shown = lines.reduce((sum, l) => sum + l.amount, 0);
  return {
    ...p,
    lines,
    remainingLegCount: Math.max(0, p.legCount - lines.length),
    remainingTotal: Math.max(0, p.total - shown),
  };
};

export const httpPayrollRepo: PayrollRepo = {
  /** The driver is whoever the token belongs to; the id is not sent. */
  async summary(): Promise<EarningsSummary> {
    const {summary} = await api<{summary: EarningsSummary}>('/earnings/summary');
    return summary;
  },

  async periods(
    _driverId: string,
    status?: 'pending' | 'paid',
  ): Promise<PayPeriod[]> {
    const {periods} = await api<{periods: ApiPeriod[]}>(
      `/earnings/periods${status ? `?status=${status}` : ''}`,
    );
    return periods.map(toPeriod);
  },

  async period(id: string): Promise<PayPeriod | null> {
    const r = await maybe(api<{period: ApiPeriod}>(`/earnings/periods/${id}`));
    return r ? toPeriod(r.period) : null;
  },
};
