"use client";
// .togg — on/off switch (plan W-03a per-customer completion-email opt-in).
export function Toggle({
  on,
  onChange,
  disabled = false,
}: {
  on: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <span
      className={`togg${on ? " on" : ""}`}
      role="switch"
      aria-checked={on}
      aria-disabled={disabled}
      onClick={disabled ? undefined : () => onChange?.(!on)}
      style={disabled ? { opacity: 0.45, cursor: "not-allowed" } : { cursor: "pointer" }}
    />
  );
}
