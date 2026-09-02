/**
 * The presentation-string layer (BACKEND_PLAN §4).
 *
 * The contracts carry formatted copy — `dueLabel`, `whenLabel`, `greeting`,
 * `assignedLabel` — because both UIs render it directly. Something has to
 * compute it; the server does, so neither client changes and neither client
 * gets it subtly different.
 *
 * Everything here takes an explicit IANA zone. Nothing reads the host clock's
 * zone, and nothing reads the device's: a phone five hours east of Houston
 * turns a job due 17:00 local into tomorrow's job and the urgency ink
 * disappears. The zone travels with the job.
 */

export const COMPANY_TZ = 'America/Chicago';

const fmt = (tz: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts });

/** `YYYY-MM-DD` as read in `tz` — the calendar day, not a UTC instant. */
export const dayIn = (at: Date, tz: string): string => {
  const p = fmt(tz, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(at)
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day}`;
};

const hourIn = (at: Date, tz: string): number =>
  Number(fmt(tz, { hour: '2-digit', hour12: false }).format(at));

/** '5:00 PM' */
export const timeLabel = (at: Date, tz: string): string =>
  fmt(tz, { hour: 'numeric', minute: '2-digit', hour12: true }).format(at);

/** 'Nov 25' */
const dayMonth = (at: Date, tz: string): string =>
  fmt(tz, { month: 'short', day: 'numeric' }).format(at);

/** 'Tuesday · 25 November' — M18's `.home-date`. */
export const dateLabel = (at: Date, tz: string): string => {
  const weekday = fmt(tz, { weekday: 'long' }).format(at);
  const day = fmt(tz, { day: 'numeric' }).format(at);
  const month = fmt(tz, { month: 'long' }).format(at);
  return `${weekday} · ${day} ${month}`;
};

/** 'Morning, John' — M18's `.home-greet`. First name only. */
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

/**
 * 'Today, 5:00 PM' · 'Tomorrow, 9:00 AM' · 'Nov 25, 5:00 PM'.
 * Relative wording only inside a one-day window either side — past that,
 * "in 6 days" is less useful than the date itself.
 */
export const dueLabel = (dueAt: Date, now: Date, tz: string): string => {
  const d = dayOffset(dueAt, now, tz);
  const time = timeLabel(dueAt, tz);
  if (d === 0) return `Today, ${time}`;
  if (d === 1) return `Tomorrow, ${time}`;
  if (d === -1) return `Yesterday, ${time}`;
  return `${dayMonth(dueAt, tz)}, ${time}`;
};

/** 'Nov 25, 8:00 AM' — M7's assigned row. Always absolute. */
export const assignedLabel = (at: Date, tz: string): string =>
  `${dayMonth(at, tz)}, ${timeLabel(at, tz)}`;

/**
 * Chat/notes relative stamp: '2m' · '4h' · '8:02 AM' today · 'Nov 25' older.
 * Minutes and hours only while it still reads as "just now"; after that the
 * clock time is what a driver actually wants.
 */
export const whenLabel = (at: Date, now: Date, tz: string): string => {
  const mins = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 6) return `${Math.floor(mins / 60)}h`;
  if (dayOffset(at, now, tz) === 0) return timeLabel(at, tz);
  if (dayOffset(at, now, tz) === -1) return 'Yesterday';
  return dayMonth(at, tz);
};

/** 'Today' | 'Yesterday' | 'Nov 25' — the `.sect-lbl` group header. */
export const groupLabel = (at: Date, now: Date, tz: string): string => {
  const d = dayOffset(at, now, tz);
  if (d === 0) return 'Today';
  if (d === -1) return 'Yesterday';
  return dayMonth(at, tz);
};

/**
 * 'Nov 10 – Nov 16' — a pay period's span. En dash, matching the design.
 *
 * Takes calendar dates ('YYYY-MM-DD', how `date` columns now arrive) as well
 * as Dates. A bare date is anchored at noon UTC before formatting: it belongs
 * to no zone, and midnight would land on the previous day in any zone west of
 * UTC — which `tz` always is.
 */
const asDate = (d: Date | string): Date =>
  typeof d === 'string' ? new Date(`${d}T12:00:00Z`) : d;

export const rangeLabel = (from: Date | string, to: Date | string, tz: string): string =>
  `${dayMonth(asDate(from), tz)} – ${dayMonth(asDate(to), tz)}`;

/** 'Fri, Dec 05' — M18's earnings card and the pays-on lines. */
export const payDayLabel = (at: Date, tz: string): string =>
  `${fmt(tz, { weekday: 'short' }).format(at)}, ${fmt(tz, {
    month: 'short',
    day: '2-digit',
  }).format(at)}`;
