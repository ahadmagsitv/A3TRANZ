// .spill — sp-pending/progress/review/done/overdue (plan §1.1 status tokens).
import type { JobStatus } from "@/data/contracts/jobs";

const LABEL: Record<JobStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  awaiting_approval: "Awaiting approval",
  done: "Done",
  blocked: "Blocked",
  overdue: "Overdue",
};

const CLASS: Record<JobStatus, string> = {
  pending: "sp-pending",
  in_progress: "sp-progress",
  awaiting_approval: "sp-review",
  done: "sp-done",
  blocked: "sp-overdue",
  overdue: "sp-overdue",
};

export function StatusPill({ status, label }: { status: JobStatus; label?: string }) {
  return <span className={`spill ${CLASS[status]}`}>{label ?? LABEL[status]}</span>;
}
