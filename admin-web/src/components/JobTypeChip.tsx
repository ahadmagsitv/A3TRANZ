import type { JobType } from "@/data/contracts/jobs";

const LABEL: Record<JobType, string> = { import: "Import", export: "Export" };
const CLASS: Record<JobType, string> = { import: "imp", export: "exp" };

export function JobTypeChip({ type }: { type: JobType }) {
  return <span className={`jtype ${CLASS[type]}`}>{LABEL[type]}</span>;
}
