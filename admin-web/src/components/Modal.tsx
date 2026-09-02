"use client";
// .scrim-bg + .modal — 640px, max-height 88%, body scrolls (plan §6.4).
// title is optional: confirm-style modals (W8-confirm, W21-confirm) have no
// `.modal-h` header/close-X in the gallery at all — body + footer only.
import type { CSSProperties, ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({
  title,
  onClose,
  footer,
  children,
  style,
}: {
  title?: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="scrim-bg">
      <div className="modal" style={style}>
        {title && (
          <div className="modal-h">
            <h3>{title}</h3>
            <span className="x" onClick={onClose} role="button" aria-label="Close">
              <X />
            </span>
          </div>
        )}
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}
