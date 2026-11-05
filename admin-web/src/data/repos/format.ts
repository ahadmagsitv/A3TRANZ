const MIN = 60_000;

export function relative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 0) return "Today";
  if (diff < MIN) return "now";
  if (diff < 60 * MIN) return `${Math.floor(diff / MIN)} min ago`;
  if (diff < 24 * 60 * MIN) return `${Math.floor(diff / (60 * MIN))} h ago`;
  if (diff < 48 * 60 * MIN) return "Yesterday";
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function dayLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t);
  if (d.toDateString() === new Date().toDateString()) return "Today";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function monthYear(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
