// .kpi — label + icon well + big tabular number + delta (plan W-05a, W-11).
import type { ReactNode } from "react";

export function Kpi({
  label,
  icon,
  iconBg,
  iconColor,
  value,
  delta,
  deltaTone,
}: {
  label: string;
  icon: ReactNode;
  iconBg: string; // CSS var()-based background, e.g. "rgba(37,99,235,.12)"
  iconColor: string; // e.g. "var(--st-progress)"
  value: ReactNode;
  delta?: ReactNode;
  deltaTone?: "up" | "down" | "neutral";
}) {
  return (
    <div className="kpi">
      <div className="kpi-l">
        {label}
        <span className="kpi-ic" style={{ background: iconBg, color: iconColor }}>
          {icon}
        </span>
      </div>
      <div className="kpi-n">{value}</div>
      {delta && (
        <div className={`kpi-d${deltaTone === "up" ? " up" : deltaTone === "down" ? " down" : ""}`}>
          {delta}
        </div>
      )}
    </div>
  );
}
