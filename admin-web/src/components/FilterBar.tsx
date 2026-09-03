"use client";
// .filterbar / .search / .chipf (plan W-05b, W-03a, W-04a, W-03d, W-10a filters).
import type { ReactNode } from "react";
import { ChevronDown, Search } from "lucide-react";

export function FilterBar({
  searchPlaceholder,
  searchValue,
  onSearchChange,
  children,
}: {
  searchPlaceholder: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="filterbar">
      <div className="search">
        <Search />
        <input
          value={searchValue}
          onChange={(e) => onSearchChange?.(e.target.value)}
          placeholder={searchPlaceholder}
          style={{
            border: "none",
            outline: "none",
            background: "transparent",
            flex: 1,
            font: "inherit",
            color: "inherit",
          }}
        />
      </div>
      {children}
    </div>
  );
}

export function FilterChip({
  active = false,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`chipf${active ? " on" : ""}`} onClick={onClick} role="button">
      {children}
    </div>
  );
}

/**
 * A `.chipf` pill that is a real <select> underneath (transparent, absolutely
 * positioned over the label) — pixel-identical to the gallery's dropdown
 * chips but genuinely functional, no custom popover/menu component needed.
 */
export function ChipSelect({
  label,
  value,
  onChange,
  options,
  active = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  active?: boolean;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <label className={`chipf${active ? " on" : ""}`} style={{ position: "relative" }}>
      {label}
      {current ? `: ${current.label}` : ""}
      <ChevronDown />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
