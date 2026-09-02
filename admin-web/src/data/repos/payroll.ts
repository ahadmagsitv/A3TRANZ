import type { PayPeriod, PayrollRepo } from "@/data/contracts/payroll";
import { api, maybe } from "./api";

/**
 * The API already returns this shape — groups, lines, the "+N more legs"
 * rollup and the money as dollars. The only work here is `null` vs `undefined`
 * on the two optional fields, because the contract declares them optional
 * rather than nullable and `reference: null` is not assignable to `string?`.
 */
interface ApiPeriod extends Omit<PayPeriod, "reference" | "paidAt"> {
  reference: string | null;
  paidAt: string | null;
}

const toPeriod = ({ reference, paidAt, ...rest }: ApiPeriod): PayPeriod => ({
  ...rest,
  ...(reference ? { reference } : {}),
  ...(paidAt ? { paidAt } : {}),
});

export const payrollRepo: PayrollRepo = {
  async list(): Promise<PayPeriod[]> {
    const { periods } = await api<{ periods: ApiPeriod[] }>("/payroll/periods");
    return periods.map(toPeriod);
  },

  async get(id: string): Promise<PayPeriod | null> {
    const r = await maybe(api<{ period: ApiPeriod }>(`/payroll/periods/${id}`));
    return r ? toPeriod(r.period) : null;
  },

  async updateLineAmount(
    periodId: string,
    driverId: string,
    jobId: string,
    legLabel: string,
    amount: number,
  ): Promise<PayPeriod> {
    const { period } = await api<{ period: ApiPeriod }>(
      `/payroll/periods/${periodId}/line`,
      { method: "PATCH", body: { driverId, jobId, legLabel, amount } },
    );
    return toPeriod(period);
  },

  /** Records that a payment happened elsewhere. Moves no money. */
  async markPaid(id: string, reference: string, paidAt: string): Promise<PayPeriod> {
    const { period } = await api<{ period: ApiPeriod }>(
      `/payroll/periods/${id}/mark-paid`,
      { method: "POST", body: { reference, paidAt } },
    );
    return toPeriod(period);
  },
};
