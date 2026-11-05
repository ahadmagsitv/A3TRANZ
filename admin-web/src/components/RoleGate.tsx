"use client";
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { can, type Capability } from "@/lib/rbac";
import type { Role } from "@/data/contracts/auth";

export function RoleGate({
  role,
  cap,
  children,
}: {
  role: Role;
  cap: Capability;
  children: ReactNode;
}) {
  const allowed = can(role, cap);
  if (allowed) return <>{children}</>;
  return (
    <span
      style={{
        opacity: 0.45,
        pointerEvents: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
      aria-disabled="true"
      title="You don't have permission for this action"
    >
      {children}
      <Lock size={14} />
    </span>
  );
}
