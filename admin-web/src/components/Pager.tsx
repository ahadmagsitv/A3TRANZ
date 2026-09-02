"use client";
// .pager / .pg — static-page pager, no table library (plan §2.2).
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pager({
  page,
  totalPages,
  rangeLabel,
  onChange,
}: {
  page: number;
  totalPages: number;
  rangeLabel: string;
  onChange: (page: number) => void;
}) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  return (
    <div className="pager">
      <span>{rangeLabel}</span>
      <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
        <span className="pg" role="button" onClick={() => onChange(Math.max(1, page - 1))}>
          <ChevronLeft size={16} />
        </span>
        {pages.map((p) => (
          <span
            key={p}
            className={`pg${p === page ? " on" : ""}`}
            role="button"
            onClick={() => onChange(p)}
          >
            {p}
          </span>
        ))}
        <span className="pg" role="button" onClick={() => onChange(Math.min(totalPages, page + 1))}>
          <ChevronRight size={16} />
        </span>
      </div>
    </div>
  );
}
