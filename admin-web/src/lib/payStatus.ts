// Pay states → StatusPill mapping (plan §7.3): Accruing sp-pending, Held
// sp-review, Payable sp-progress, Paid sp-done. One source for W19's table,
// W20's header pill and W20's per-driver .paygrp pills (PayGroup.tsx has its
// own narrower copy of this same mapping — kept in sync by hand since its
// prop type is a 4-string literal union, not worth widening for one caller).
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
