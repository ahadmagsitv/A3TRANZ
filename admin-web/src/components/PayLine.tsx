// .payline — a single job-leg row inside a PayGroup (plan W-10b).
import { Money } from "./Money";

export function PayLine({
  jobId,
  jobTitle,
  legLabel,
  amount,
}: {
  jobId: string;
  jobTitle: string;
  legLabel: string;
  amount: number;
}) {
  return (
    <div className="payline">
      <span className="pj">{jobId}</span>
      {legLabel} · {jobTitle}
      <span style={{ marginLeft: "auto", color: "var(--text)", fontWeight: 600 }}>
        <Money amount={amount} />
      </span>
    </div>
  );
}

export function PayLineMore({ count, amount }: { count: number; amount: number }) {
  return (
    <div className="payline" style={{ background: "var(--surface-2)" }}>
      <span style={{ font: "600 13px var(--f)", color: "var(--text-2)" }}>+ {count} more legs</span>
      <span style={{ marginLeft: "auto", color: "var(--text)", fontWeight: 600 }}>
        <Money amount={amount} />
      </span>
    </div>
  );
}
