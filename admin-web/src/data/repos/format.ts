/**
 * Display strings the API does not compute.
 *
 * The API already labels what it owns the timezone for — `dueLabel`,
 * `whenLabel`, the notification `group` (BACKEND_PLAN §4). These three are the
 * leftovers the admin tables render raw, and the fixtures set the wording:
 * "Today", "10 min ago", "Mar 2023". Formatting here rather than in the tables
 * keeps the change to the data layer.
 */
const MIN = 60_000;

/** "now" · "10 min ago" · "3 h ago" · "Today" · "Yesterday" · "Mar 12" */
export function relative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 0) return "Today"; // a due-soon or clock-skewed stamp, not "-3 min ago"
  if (diff < MIN) return "now";
  if (diff < 60 * MIN) return `${Math.floor(diff / MIN)} min ago`;
  if (diff < 24 * 60 * MIN) return `${Math.floor(diff / (60 * MIN))} h ago`;
  if (diff < 48 * 60 * MIN) return "Yesterday";
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Today" when it is today, else the same short date. Used for "Last job". */
export function dayLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t);
  if (d.toDateString() === new Date().toDateString()) return "Today";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Mar 2023" */
export function monthYear(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
