// .money / .money-lg — tabular-nums, --text ink. Never green, never amber
// (plan §6.7). Payment state belongs in a StatusPill next to this, never in
// this component's color.
export function Money({ amount, size = "md" }: { amount: number; size?: "md" | "lg" }) {
  const formatted = amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  return <span className={size === "lg" ? "money-lg" : "money"}>{formatted}</span>;
}
