export function Money({ amount, size = "md" }: { amount: number; size?: "md" | "lg" }) {
  const formatted = amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  return <span className={size === "lg" ? "money-lg" : "money"}>{formatted}</span>;
}
