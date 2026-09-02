/**
 * Dev seed. Loads mobile-app's fixtures — they are already state-machine
 * shaped (evidence slot map, 12-item inspection, legs keyed by `kind`), so
 * nothing has to be reconstructed. Admin-only columns are filled in here.
 *
 * This is throwaway demo data, not a deliverable: re-runnable, destructive,
 * and refused outright against anything that is not localhost.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  EVIDENCE_STEPS,
  INSPECTION_ITEMS,
  requiredPhotoCount,
} from '@a3/domain';
import { pool, tx } from './db.ts';
import { hash } from './password.ts';

const url = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1|db):/.test(url)) {
  throw new Error(`refusing to seed a non-local database: ${url.replace(/:[^:@]*@/, ':***@')}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fx = JSON.parse(
  await readFile(join(root, 'mobile-app', 'src', 'data', 'fixtures.json'), 'utf8'),
);

const cents = (dollars: number | null | undefined): number | null =>
  dollars == null ? null : Math.round(dollars * 100);

/**
 * The fixtures were authored around 2025-11-25 — their "Today, 5:00 PM" job is
 * that day. Left alone, every seeded job is months overdue and the home card
 * reads `overdue: 6`, which is correct behaviour on stale data and useless in
 * a demo. Shift everything by the same WHOLE number of days so times of day,
 * weekday alignment and the relative order of every record are preserved.
 */
const FIXTURE_TODAY = Date.parse('2025-11-25T00:00:00Z');
// Anchor on TODAY'S midnight and floor. Rounding against `Date.now()` pushes
// the whole dataset a day forward whenever the clock is past midday, which
// dates every seeded message and note into the future — they then sort ahead
// of anything created live, and "today's" job is really tomorrow's.
const TODAY_UTC = Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
const SHIFT_DAYS = Math.floor((TODAY_UTC - FIXTURE_TODAY) / 86_400_000);
const shift = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t + SHIFT_DAYS * 86_400_000).toISOString();
};
const shiftDay = (ymd: string): string => shift(`${ymd}T00:00:00Z`)!.slice(0, 10);

/**
 * Pay periods are defined by WEEKDAY — Monday to Sunday, paying the following
 * Friday — so they cannot be shifted by an arbitrary number of days like every
 * other date here. A 341-day shift turned Monday into Tuesday and moved payday
 * to a Saturday, while the periods the API itself creates were correctly
 * Mon–Sun. Rounding the shift to whole weeks keeps a Monday a Monday.
 */
const SHIFT_WEEKS_DAYS = Math.round(SHIFT_DAYS / 7) * 7;
const shiftPeriodDay = (ymd: string): string =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + SHIFT_WEEKS_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

/** Fixture drivers carry no phone/joinedAt; admin screens need them. */
const PHONE = (i: number) => `+1 713 555 0${(100 + i).toString()}`;
const PLATE = (id: string) => `TX ${id.replace(/\D/g, '').padStart(5, '0')}`;

const ADMIN_ROLES = ['admin', 'dispatcher'] as const;
const PASSWORD = fx.auth.password as string;

/**
 * Evidence imagery for the demo.
 *
 * The seed used to write `seed/<job>/<step>/<slot>.jpg` — keys with no bytes
 * behind them anywhere, so every review screen rendered nine broken images
 * (W22 reviews all nine before closing a job). These fixtures carry no
 * per-slot photo, but they do carry a handful of real freight images for
 * `photos`, so evidence borrows from that pool and the screens show something
 * true to size and shape.
 *
 * ponytail: demo imagery, not evidence. Real capture writes a bucket key
 * through `/uploads/presign`, and `publicUrl` signs whatever is stored.
 */
const EVIDENCE_POOL = [
  ...new Set((fx.photos as any[]).map(p => p.uri as string).filter(Boolean)),
];
let poolCursor = 0;
const evidenceUri = (jobId: string, step: string, slot: number): string =>
  EVIDENCE_POOL.length === 0
    ? `seed/${jobId}/${step}/${slot}.jpg`
    : EVIDENCE_POOL[poolCursor++ % EVIDENCE_POOL.length]!;

/**
 * Defects are keyed by the job they blocked, so the pre-trip that produced
 * them can be seeded consistently. The fixture's defect names the checklist
 * item by LABEL; `inspection_items` stores the item id.
 */
const defectByJob = new Map<string, { item: string; note: string }>(
  (fx.defects as any[]).map(d => [d.jobId as string, { item: d.item, note: d.note }]),
);

await tx(async c => {
  // Order matters only for the FKs; TRUNCATE ... CASCADE handles the rest.
  await c.query(`TRUNCATE users, customers, fleet_units, jobs, job_legs,
    inspection_items, defects, job_evidence, job_photos, job_attachments,
    threads, messages, thread_reads, job_notes, pay_periods, pay_lines,
    notifications, notification_prefs, outbox, password_resets CASCADE`);

  const pw = await hash(PASSWORD);

  // ── users: drivers + office, one table ────────────────────────────────────
  for (const [i, d] of (fx.drivers as any[]).entries()) {
    await c.query(
      `INSERT INTO users (id,email,password_hash,name,initials,role,phone,base,
                          active,joined_at,last_active_at)
       VALUES ($1,$2,$3,$4,$5,'driver',$6,$7,$8,$9,now())`,
      [d.id, d.email, pw, d.name, d.initials, PHONE(i), d.base, d.active,
       shift('2024-03-01T00:00:00Z')],
    );
  }
  for (const [i, a] of (fx.admins as any[]).entries()) {
    await c.query(
      `INSERT INTO users (id,email,password_hash,name,initials,role,phone,base,active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Houston',true)`,
      [a.id, `${a.name.toLowerCase().replace(/\W+/g, '.')}@a3transport.com`, pw,
       a.name, a.initials, ADMIN_ROLES[i] ?? 'dispatcher', PHONE(50 + i)],
    );
  }

  // ── customers ─────────────────────────────────────────────────────────────
  for (const [i, cu] of (fx.customers as any[]).entries()) {
    await c.query(
      `INSERT INTO customers (id,name,short_name,email,contact_name,phone,
                              notify_on_completion,customer_since)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [cu.id, cu.name, cu.shortName,
       `dispatch@${cu.shortName.toLowerCase().replace(/\W+/g, '')}.com`,
       'Operations', PHONE(200 + i), cu.notifyOnCompletion, shiftDay('2024-01-15')],
    );
  }

  // ── fleet ─────────────────────────────────────────────────────────────────
  for (const u of fx.fleet as any[]) {
    await c.query(
      `INSERT INTO fleet_units (id,kind,label,plate,status,last_inspection_at,next_due_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [u.id, u.kind, `${u.kind === 'truck' ? 'Truck' : 'Chassis'} ${u.id}`,
       PLATE(u.id), u.outOfService ? 'out_of_service' : 'in_service',
       shift('2025-11-01T08:00:00Z'), shift('2026-02-01T08:00:00Z')],
    );
  }

  // ── jobs ──────────────────────────────────────────────────────────────────
  for (const j of fx.jobs as any[]) {
    await c.query(
      `INSERT INTO jobs (id,title,customer_id,type,priority,status,step,driver_id,
        pickup_location,delivery_location,address,map_query,assigned_at,due_at,
        container_no,seal_no,truck_id,chassis_id,price_cents,description,instructions,
        submitted_at,approved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
               $22,$23)`,
      [j.id, j.title, j.customerId, j.type, j.priority, j.status, j.step, j.driverId,
       // Fixtures carry one location; it is the delivery end. The pickup end is
       // admin-only data the mobile file never had.
       'Terminal B, Port of Houston', j.location, j.address, j.mapQuery,
       shift(j.assignedAt), shift(j.dueAt), j.containerNo, j.sealNo, j.truckId, j.chassisId,
       cents(j.price), j.description, j.instructions,
       // A submitted or approved job must carry the stamps its status implies,
       // or W22 renders a closeout with no submission time and `doneThisWeek`
       // counts nothing. Both are derived from the due date, the only honest
       // anchor a fixture leaves behind.
       j.status === 'awaiting_approval' || j.status === 'done' ? shift(j.dueAt) : null,
       j.status === 'done' ? shift(j.dueAt) : null],
    );

    for (const [ordinal, leg] of ((j.legs ?? []) as any[]).entries()) {
      await c.query(
        `INSERT INTO job_legs (job_id,kind,driver_id,amount_cents,ordinal)
         VALUES ($1,$2,$3,$4,$5)`,
        [j.id, leg.kind, leg.driverId, cents(leg.amount), ordinal],
      );
    }

    // Pre-trip: a job past 'pretrip' has by definition passed all 12. A job
    // carrying a defect has also been inspected — that is where the defect
    // came from — so it gets the checklist too, with the failed item marked
    // and quoted. Without this a unit sat out of service because of a job
    // whose inspection card read "0 of 0 passed".
    const defect = defectByJob.get(j.id);
    const started = j.step !== 'pretrip' || j.status === 'blocked' || defect !== undefined;
    if (started) {
      for (const item of INSPECTION_ITEMS) {
        const failed = defect !== undefined && item.label === defect.item;
        await c.query(
          `INSERT INTO inspection_items (job_id,item_id,result,note) VALUES ($1,$2,$3,$4)`,
          // The schema refuses a defect with no note, so the note travels with
          // the result rather than being attached afterwards.
          [j.id, item.id, failed ? 'defect' : 'pass', failed ? defect.note : null],
        );
      }
    }

    // Evidence: a submitted or approved job carries all nine by definition.
    // Anything mid-flow carries the steps it has already advanced past.
    const stepIdx = ['pretrip', 'pickup', 'load', 'delivery'].indexOf(j.step);
    const complete = j.status === 'awaiting_approval' || j.status === 'done';
    for (const [i, step] of EVIDENCE_STEPS.entries()) {
      const past = complete || i + 1 < stepIdx;
      if (!past) continue;
      for (let slot = 0; slot < requiredPhotoCount(step); slot++) {
        await c.query(
          `INSERT INTO job_evidence (job_id,step,slot_index,s3_key) VALUES ($1,$2,$3,$4)`,
          [j.id, step, slot, evidenceUri(j.id, step, slot)],
        );
      }
    }
  }

  // Defects reference a job, so they land after jobs.
  for (const d of fx.defects as any[]) {
    await c.query(
      `INSERT INTO defects (id,unit_id,job_id,item,note,reported_by,reported_at,photo_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [d.id, d.unitId, d.jobId, d.item, d.note, d.reportedBy, shift(d.reportedAt), d.photoUri],
    );
  }

  for (const a of fx.attachments as any[]) {
    await c.query(
      `INSERT INTO job_attachments (id,job_id,name,size_bytes,s3_key,origin,kind,step)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [a.id, a.jobId, a.name, parseInt(a.size, 10) * 1024 || 0,
       `seed/${a.jobId}/${a.name}`, a.origin, a.kind, a.step],
    );
  }
  for (const p of fx.photos as any[]) {
    await c.query(
      `INSERT INTO job_photos (id,job_id,s3_key,alt,uploaded_by) VALUES ($1,$2,$3,$4,$5)`,
      [p.id, p.jobId, p.uri, p.alt, fx.drivers[0].id],
    );
  }

  // ── chat ──────────────────────────────────────────────────────────────────
  const driverOf = new Map((fx.jobs as any[]).map(j => [j.id, j.driverId]));
  for (const t of fx.threads as any[]) {
    await c.query(
      `INSERT INTO threads (id,job_id,driver_id,admin_id) VALUES ($1,$2,$3,$4)`,
      [t.id, t.jobId, driverOf.get(t.jobId) ?? fx.drivers[0].id, t.adminId],
    );
  }
  // Seeded chat is history, so it is anchored to now and counted backwards
  // three minutes apart. `shift()` moves whole days only and kept the fixture's
  // 14:00Z time of day, which is in the FUTURE for any run before 14:00Z — the
  // thread then rendered a live reply above messages it was answering, and the
  // suite passed or failed depending on the hour it ran.
  const msgs = fx.messages as any[];
  for (const [i, m] of msgs.entries()) {
    await c.query(
      `INSERT INTO messages (id,thread_id,author_id,body,attachment_key,created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [m.id, m.threadId, m.authorId, m.body, m.attachmentUri,
       new Date(Date.now() - (msgs.length - i) * 180_000).toISOString()],
    );
  }
  // Unread is derived from thread_reads, so an unread thread is simply one the
  // driver has no read-marker on. Threads the fixture calls read get a marker.
  for (const t of fx.threads as any[]) {
    if (t.unread > 0) continue;
    await c.query(
      `INSERT INTO thread_reads (thread_id,user_id,last_read_at) VALUES ($1,$2,now())`,
      [t.id, driverOf.get(t.jobId) ?? fx.drivers[0].id],
    );
  }
  for (const n of fx.notes as any[]) {
    await c.query(
      `INSERT INTO job_notes (id,job_id,author_id,body) VALUES ($1,$2,$3,$4)`,
      [n.id, n.jobId, n.authorId, n.body],
    );
  }

  // ── notifications ─────────────────────────────────────────────────────────
  const driverId = fx.drivers[0].id as string;
  for (const [i, n] of (fx.notifications as any[]).entries()) {
    await c.query(
      `INSERT INTO notifications (id,user_id,kind,title,body,job_id,read_at,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [n.id, driverId, n.kind, n.title, n.body, n.jobId,
       n.read ? new Date().toISOString() : null,
       new Date(Date.now() - i * 3_600_000).toISOString()],
    );
  }
  for (const u of [...fx.drivers, ...fx.admins] as any[]) {
    await c.query(
      `INSERT INTO notification_prefs (user_id,kind,enabled)
       SELECT $1, k, true FROM unnest(enum_range(NULL::notification_kind)) k`,
      [u.id],
    );
  }

  // ── payroll: one company-wide period, driver slices are a projection ──────
  const seen = new Set<string>();
  for (const p of fx.payPeriods as any[]) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      const [startLabel] = p.label.split('–').map((s: string) => s.trim());
      await c.query(
        `INSERT INTO pay_periods (id,label,starts_on,ends_on,status,closes_at,pays_at,
                                  reference,paid_at,method)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [p.id,
         spanLabel(shiftPeriodDay(periodStart(p.id)), shiftPeriodDay(periodEnd(p.id))),
         shiftPeriodDay(periodStart(p.id)), shiftPeriodDay(periodEnd(p.id)),
         p.status === 'accruing' ? 'accruing' : p.status,
         `${shiftPeriodDay(periodEnd(p.id))}T23:59:59Z`,
         `${shiftPeriodDay(periodPays(p.id))}T12:00:00Z`,
         p.reference,
         p.paidOnLabel ? `${shiftPeriodDay(periodPays(p.id))}T12:00:00Z` : null,
         p.method],
      );
    }
    // The fixture ships `lines: []` on most periods and a total. Materialise
    // the total as one line per leg so W20 has rows and the sums agree.
    const jobsForDriver = (fx.jobs as any[]).filter(j => j.driverId === p.driverId);
    let remaining = cents(p.total) ?? 0;
    for (const j of jobsForDriver) {
      for (const leg of (j.legs ?? []) as any[]) {
        if (remaining <= 0) break;
        const amt = Math.min(cents(leg.amount) ?? 0, remaining);
        const ins = await c.query(
          `INSERT INTO pay_lines (period_id,job_id,leg_kind,driver_id,amount_cents)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING 1`,
          [p.id, j.id, leg.kind, p.driverId, amt],
        );
        if (ins.rowCount) remaining -= amt;
      }
    }
  }
});

/** Period ids are `PER-YYYY-WW`. ISO week → the Monday it starts. */
function isoWeekMonday(id: string): Date {
  const [, y, w] = id.split('-');
  const jan4 = new Date(Date.UTC(Number(y), 0, 4));
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const d = new Date(week1Mon);
  d.setUTCDate(week1Mon.getUTCDate() + (Number(w) - 1) * 7);
  return d;
}
function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function periodStart(id: string) {
  return iso(isoWeekMonday(id));
}
function periodEnd(id: string) {
  const d = isoWeekMonday(id);
  d.setUTCDate(d.getUTCDate() + 6);
  return iso(d);
}
/** 'Nov 24 – Nov 30' — derived from the shifted span, never the stale literal. */
function spanLabel(fromYmd: string, toYmd: string) {
  const f = (d: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
    }).format(new Date(`${d}T00:00:00Z`));
  return `${f(fromYmd)} – ${f(toYmd)}`;
}

/** Held one week, then pays the following Friday. */
function periodPays(id: string) {
  const d = isoWeekMonday(id);
  d.setUTCDate(d.getUTCDate() + 18);
  return iso(d);
}

const counts = await pool.query<{ t: string; n: string }>(`
  SELECT 'users' t, count(*)::text n FROM users
  UNION ALL SELECT 'customers', count(*)::text FROM customers
  UNION ALL SELECT 'fleet_units', count(*)::text FROM fleet_units
  UNION ALL SELECT 'jobs', count(*)::text FROM jobs
  UNION ALL SELECT 'job_legs', count(*)::text FROM job_legs
  UNION ALL SELECT 'inspection_items', count(*)::text FROM inspection_items
  UNION ALL SELECT 'job_evidence', count(*)::text FROM job_evidence
  UNION ALL SELECT 'defects', count(*)::text FROM defects
  UNION ALL SELECT 'threads', count(*)::text FROM threads
  UNION ALL SELECT 'messages', count(*)::text FROM messages
  UNION ALL SELECT 'pay_periods', count(*)::text FROM pay_periods
  UNION ALL SELECT 'pay_lines', count(*)::text FROM pay_lines
  UNION ALL SELECT 'notifications', count(*)::text FROM notifications
  ORDER BY 1`);
console.log(counts.rows.map(r => `  ${r.t.padEnd(18)}${r.n}`).join('\n'));
console.log(`\nseeded. login: ${fx.auth.email} / ${PASSWORD}`);
await pool.end();
