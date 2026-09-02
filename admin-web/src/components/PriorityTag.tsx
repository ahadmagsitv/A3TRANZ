// .pri — pri-high/med/low (plan §1.1 priority tokens).
import { Flag } from "lucide-react";
import type { Priority } from "@/data/contracts/jobs";

const LABEL: Record<Priority, string> = { high: "High", med: "Medium", low: "Low" };
const CLASS: Record<Priority, string> = { high: "pri-high", med: "pri-med", low: "pri-low" };

export function PriorityTag({ priority }: { priority: Priority }) {
  return (
    <span className={`pri ${CLASS[priority]}`}>
      <Flag />
      {LABEL[priority]}
    </span>
  );
}
