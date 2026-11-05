export const COMPANY_TZ = 'America/Chicago';

const fmt = (tz: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts });

export const dayIn = (at: Date, tz: string): string => {
  const p = fmt(tz, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(at)
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day}`;
};

const hourIn = (at: Date, tz: string): number =>
  Number(fmt(tz, { hour: '2-digit', hour12: false }).format(at));

export const timeLabel = (at: Date, tz: string): string =>
  fmt(tz, { hour: 'numeric', minute: '2-digit', hour12: true }).format(at);

const dayMonth = (at: Date, tz: string): string =>
  fmt(tz, { month: 'short', day: 'numeric' }).format(at);

export const dateLabel = (at: Date, tz: string): string => {
  const weekday = fmt(tz, { weekday: 'long' }).format(at);
  const day = fmt(tz, { day: 'numeric' }).format(at);
  const month = fmt(tz, { month: 'long' }).format(at);
  return `${weekday} · ${day} ${month}`;
};

export const greeting = (name: string, at: Date, tz: string): string => {
  const h = hourIn(at, tz);
  const part = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  return `${part}, ${name.split(/\s+/)[0] ?? name}`;
};

const dayOffset = (target: Date, now: Date, tz: string): number => {
  const a = Date.parse(`${dayIn(target, tz)}T00:00:00Z`);
  const b = Date.parse(`${dayIn(now, tz)}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
};

export const dueLabel = (dueAt: Date, now: Date, tz: string): string => {
  const d = dayOffset(dueAt, now, tz);
  const time = timeLabel(dueAt, tz);
  if (d === 0) return `Today, ${time}`;
  if (d === 1) return `Tomorrow, ${time}`;
  if (d === -1) return `Yesterday, ${time}`;
  return `${dayMonth(dueAt, tz)}, ${time}`;
};

export const assignedLabel = (at: Date, tz: string): string =>
  `${dayMonth(at, tz)}, ${timeLabel(at, tz)}`;

export const whenLabel = (at: Date, now: Date, tz: string): string => {
  const mins = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 6) return `${Math.floor(mins / 60)}h`;
  if (dayOffset(at, now, tz) === 0) return timeLabel(at, tz);
  if (dayOffset(at, now, tz) === -1) return 'Yesterday';
  return dayMonth(at, tz);
};

export const groupLabel = (at: Date, now: Date, tz: string): string => {
  const d = dayOffset(at, now, tz);
  if (d === 0) return 'Today';
  if (d === -1) return 'Yesterday';
  return dayMonth(at, tz);
};

const asDate = (d: Date | string): Date =>
  typeof d === 'string' ? new Date(`${d}T12:00:00Z`) : d;

export const rangeLabel = (from: Date | string, to: Date | string, tz: string): string =>
  `${dayMonth(asDate(from), tz)} – ${dayMonth(asDate(to), tz)}`;

export const payDayLabel = (at: Date, tz: string): string =>
  `${fmt(tz, { weekday: 'short' }).format(at)}, ${fmt(tz, {
    month: 'short',
    day: '2-digit',
  }).format(at)}`;
