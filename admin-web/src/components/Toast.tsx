// .toast — toast-ok/info/warn/err (plan §1.1 tint tokens).
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

export type ToastTone = "ok" | "info" | "warn" | "err";

const ICON: Record<ToastTone, ReactNode> = {
  ok: <CheckCircle2 />,
  info: <Info />,
  warn: <AlertTriangle />,
  err: <AlertTriangle />,
};

export function Toast({ tone, children }: { tone: ToastTone; children: ReactNode }) {
  return (
    <div className={`toast toast-${tone}`}>
      {ICON[tone]}
      {children}
    </div>
  );
}
