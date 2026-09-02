"use client";
// .drawer — 480px, right-anchored, full height (plan §6.5 fixed-width exception).
import type { ReactNode } from "react";
import { X } from "lucide-react";

export function Drawer({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="drawer">
      <div className="modal-h">
        <h3>{title}</h3>
        <span className="x" onClick={onClose} role="button" aria-label="Close">
          <X />
        </span>
      </div>
      <div className="modal-b" style={{ flex: 1 }}>
        {children}
      </div>
      {footer && <div className="modal-f">{footer}</div>}
    </div>
  );
}
