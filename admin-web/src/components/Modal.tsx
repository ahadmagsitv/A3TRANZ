"use client";
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
