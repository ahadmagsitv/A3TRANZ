// .jtype — imp/exp only. .jtype.emt exists in CSS for restorability but must
// never render (plan §4 note) — this component deliberately has no "emt" case.
import type { JobType } from "@/data/contracts/jobs";

const LABEL: Record<JobType, string> = { import: "Import", export: "Export" };
const CLASS: Record<JobType, string> = { import: "imp", export: "exp" };

export function JobTypeChip({ type }: { type: JobType }) {
  return <span className={`jtype ${CLASS[type]}`}>{LABEL[type]}</span>;
}
