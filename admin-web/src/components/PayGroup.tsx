// .paygrp / .paygrp-h — one driver's legs for a pay period (plan W-10b).
import type { ReactNode } from "react";
import { Money } from "./Money";
import { StatusPill } from "./StatusPill";

export function PayGroup({
  driverInitials,
  driverName,
  amount,
  statusLabel,
  children,
}: {
  driverInitials: string;
  driverName: string;
  amount: number;
  statusLabel: "Payable" | "Held" | "Paid" | "Accruing";
  children: ReactNode;
}) {
  const status = {
    Payable: "in_progress",
    Held: "awaiting_approval",
    Paid: "done",
    Accruing: "pending",
  } as const;
  return (
    <div className="paygrp">
      <div className="paygrp-h">
        <span className="mini-av">{driverInitials}</span>
        <span className="pn">{driverName}</span>
        <span style={{ marginLeft: "auto" }}>
          <StatusPill status={status[statusLabel]} label={statusLabel} />
        </span>
        <span style={{ font: "800 17px var(--fd)", color: "var(--text)", marginLeft: 14 }}>
          <Money amount={amount} />
        </span>
      </div>
      {children}
    </div>
  );
}
