// .unitchip / .oos — fleet is not text-only (plan §1.1 Fleet uses "container", not "truck").
import type { ReactNode } from "react";

export function UnitChip({
  icon,
  children,
  outOfService = false,
}: {
  icon: ReactNode;
  children: ReactNode;
  outOfService?: boolean;
}) {
  return (
    <span className={`unitchip${outOfService ? " oos" : ""}`}>
      {icon}
      {children}
    </span>
  );
}
