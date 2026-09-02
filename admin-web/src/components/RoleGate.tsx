"use client";
// The RBAC wrapper (plan §6.6). Renders the control either way; when blocked
// applies opacity:.45 + pointer-events:none + a lock icon. Never returns
// null — a blocked action that disappears is a bug (W5-dispatcher-view-rbac
// is the reference rendering).
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
