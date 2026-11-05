import type { JobStatus } from "@/data/contracts/jobs";
import type { PayPeriodStatus } from "@/data/contracts/payroll";

export const PAY_STATUS_LABEL: Record<PayPeriodStatus, string> = {
  accruing: "Accruing",
  held: "Held",
  payable: "Payable",
  paid: "Paid",
};

export const PAY_STATUS_PILL: Record<PayPeriodStatus, JobStatus> = {
  accruing: "pending",
  held: "awaiting_approval",
  payable: "in_progress",
  paid: "done",
};
