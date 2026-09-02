// .perm — a role's capability list (plan W-12 / §6.6). Three tiers, ten rows.
import { Check, X } from "lucide-react";

export interface PermissionItem {
  label: string;
  allowed: boolean;
}

export function PermissionList({ items }: { items: PermissionItem[] }) {
  return (
    <>
      {items.map((item) => (
        <div className="perm" key={item.label} style={!item.allowed ? { color: "var(--text-2)" } : undefined}>
          {item.allowed ? <Check /> : <X style={{ color: "var(--muted)" }} />}
          {item.label}
        </div>
      ))}
    </>
  );
}
