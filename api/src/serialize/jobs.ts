/**
 * Row → `Job`. The one place a job is assembled, so both clients see exactly
 * the same shape.
 *
 * Six tables feed a job. This loads them with six queries TOTAL regardless of
 * how many jobs are asked for, then groups in memory — not six queries per
 * job. A list of 200 jobs costs the same round-trips as a list of one.
 */
import {
  EVIDENCE_STEPS,
  INSPECTION_ITEMS,
  type Evidence,
  type Inspection,
  type InspectionItem,
  type Job,
  type JobAttachment,
  type JobLeg,
  type JobPhoto,
  type JobStep,
  type TimelineEvent,
  blankEvidence,
  capturePhoto,
  isDueToday,
  isOverdue,
} from '@a3/domain';
import { q } from '../db.ts';
import { publicUrl } from '../storage.ts';
import type { QueryResult, QueryResultRow } from 'pg';
import { COMPANY_TZ, assignedLabel, dayIn, dueLabel, timeLabel } from '../labels.ts';

const dollars = (c: number | null): number | null => (c == null ? null : c / 100);

const groupBy = <T>(rows: T[], key: (r: T) => string): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const bucket = m.get(k);
    if (bucket) bucket.push(r);
    else m.set(k, [r]);
  }
  return m;
};

/**
 * Anything that can run a query: the pool, or a transaction's client.
 *
 * This parameter is load-bearing. Reading through the pool from inside a
 * transaction opens a SECOND connection, which cannot see that transaction's
 * uncommitted rows — so a write route that reloaded through the pool returned
 * the state from BEFORE its own insert, and the gate computed from it was one
 * step stale. Callers inside `tx()` must pass their client.
 */
export interface Querier {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

const pooled: Querier = { query: (text, params) => q(text, params) as never };

/** Who is looking — decides 'You' vs a driver's short name on each leg. */
export interface Viewer {
  userId: string;
  isOffice: boolean;
}

/** 'Dana Lewis' → 'Dana L.' — the `.legrow .lc` short form. */
const shortName = (full: string): string => {
  const [first, last] = full.split(/\s+/);
  return last ? `${first} ${last[0]}.` : (first ?? full);
};

export const loadJobs = async (
  where: string,
  params: unknown[],
  viewer: Viewer,
  db: Querier = pooled,
  now: Date = new Date(),
): Promise<Job[]> => {
  const { rows: jobRows } = await db.query<Record<string, any>>(
    `SELECT j.*, c.name AS customer_name, c.short_name AS customer_short
       FROM jobs j JOIN customers c ON c.id = j.customer_id
      WHERE ${where}
      ORDER BY j.due_at ASC`,
    params,
  );
  if (jobRows.length === 0) return [];

  const ids = jobRows.map(r => r.id as string);
  // Sequential, not Promise.all: a single pg client cannot run concurrent
  // queries, and `db` is a transaction client on every write path. Five
  // round-trips in series is nothing next to silently serialising anyway with
  // a deprecation warning — or, in pg@9, failing outright.
  const legs = await db.query<Record<string, any>>(
    `SELECT l.*, u.name AS driver_name FROM job_legs l
       LEFT JOIN users u ON u.id = l.driver_id
      WHERE l.job_id = ANY($1) ORDER BY l.ordinal`,
    [ids],
  );
  const items = await db.query<Record<string, any>>(
    `SELECT * FROM inspection_items WHERE job_id = ANY($1)`,
    [ids],
  );
  const evidence = await db.query<Record<string, any>>(
    `SELECT * FROM job_evidence WHERE job_id = ANY($1) ORDER BY step, slot_index`,
    [ids],
  );
  const attachments = await db.query<Record<string, any>>(
    `SELECT * FROM job_attachments WHERE job_id = ANY($1) ORDER BY created_at`,
    [ids],
  );
  const photos = await db.query<Record<string, any>>(
    `SELECT * FROM job_photos WHERE job_id = ANY($1) ORDER BY created_at`,
    [ids],
  );

  const legsBy = groupBy(legs.rows, r => r.job_id);
  const itemsBy = groupBy(items.rows, r => r.job_id);
  const evidenceBy = groupBy(evidence.rows, r => r.job_id);
  const attachBy = groupBy(attachments.rows, r => r.job_id);
  const photoBy = groupBy(photos.rows, r => r.job_id);

  return jobRows.map(r =>
    buildJob(
      r,
      legsBy.get(r.id) ?? [],
      itemsBy.get(r.id) ?? [],
      evidenceBy.get(r.id) ?? [],
      attachBy.get(r.id) ?? [],
      photoBy.get(r.id) ?? [],
      viewer,
      now,
    ),
  );
};

const buildJob = (
  r: Record<string, any>,
  legRows: Record<string, any>[],
  itemRows: Record<string, any>[],
  evidenceRows: Record<string, any>[],
  attachRows: Record<string, any>[],
  photoRows: Record<string, any>[],
  viewer: Viewer,
  now: Date,
): Job => {
  const tz: string = r.timezone ?? COMPANY_TZ;
  const dueAt: Date = r.due_at;
  const assignedAt: Date = r.assigned_at;

  const refs = {
    containerNo: r.container_no as string | null,
    chassisId: r.chassis_id as string | null,
    sealNo: r.seal_no as string | null,
  };

  // Slot labels and hints are rebuilt from SLOT_SPECS, never stored — a copy
  // change in the design ships without a data migration.
  let evidence: Evidence = blankEvidence(refs);
  for (const row of evidenceRows) {
    const step = row.step as (typeof EVIDENCE_STEPS)[number];
    if (!EVIDENCE_STEPS.includes(step)) continue;
    // capturePhoto works on a Job; feed it the shape it reads.
    const shim = { evidence, ...refs } as unknown as Job;
    evidence = capturePhoto(shim, step, row.slot_index, publicUrl(row.s3_key)!).evidence;
  }

  const legs: JobLeg[] = legRows.map(l => ({
    kind: l.kind,
    label: l.kind === 'loading' ? 'Loading' : l.kind === 'pickup' ? 'Pickup' : 'Delivery',
    driverId: l.driver_id ?? '',
    driverLabel:
      !viewer.isOffice && l.driver_id === viewer.userId
        ? 'You'
        : shortName(l.driver_name ?? 'Unassigned'),
    amount: dollars(l.amount_cents) ?? 0,
  }));

  const inspection = buildInspection(itemRows, r, tz);

  const status = r.status as Job['status'];
  const overdue = isOverdue({ dueAt: dueAt.toISOString(), status }, now);

  const step = r.step as JobStep;
  // R5: the driver-facing location is the CURRENT step's end, derived from the
  // pair the office entered rather than stored a second time.
  const location =
    step === 'pretrip' || step === 'pickup' ? r.pickup_location : r.delivery_location;

  return {
    id: r.id,
    title: r.title,
    customerId: r.customer_id,
    customerName: r.customer_short ?? r.customer_name,
    type: r.type,
    priority: r.priority,
    status,
    step,
    driverId: r.driver_id,

    location,
    address: r.address ?? '',
    mapQuery: r.map_query,
    pickupLocation: r.pickup_location,
    deliveryLocation: r.delivery_location,

    assignedAt: assignedAt.toISOString(),
    assignedLabel: assignedLabel(assignedAt, tz),
    dueAt: dueAt.toISOString(),
    dueLabel: dueLabel(dueAt, now, tz),
    timezone: tz,

    containerNo: refs.containerNo,
    sealNo: refs.sealNo,
    truckId: r.truck_id,
    chassisId: r.chassis_id,

    price: dollars(r.price_cents),
    legs,

    description: r.description,
    instructions: r.instructions,
    photoCount: evidenceRows.length + photoRows.length,
    inspection,
    evidence,
    attachments: attachRows.map(toAttachment),
    photos: photoRows.map(toPhoto),
    timeline: viewer.isOffice ? buildTimeline(r, evidenceRows, tz) : [],

    submittedAt: r.submitted_at ? r.submitted_at.toISOString() : null,
    approvedAt: r.approved_at ? r.approved_at.toISOString() : null,

    overdue,
    dueToday: isDueToday({ dueAt: dueAt.toISOString(), status }, dayIn(now, tz)),
    version: r.version,
  };
};

/**
 * No inspection rows means the driver has not started the checklist — that is
 * `null`, not twelve blank items. M19 renders a fresh checklist from
 * `blankInspection()`; a half-empty payload would look like progress.
 */
const buildInspection = (
  rows: Record<string, any>[],
  job: Record<string, any>,
  tz: string,
): Inspection | null => {
  if (rows.length === 0) return null;
  const by = new Map(rows.map(r => [r.item_id as string, r]));
  const items: InspectionItem[] = INSPECTION_ITEMS.map(spec => {
    const row = by.get(spec.id);
    return {
      id: spec.id,
      label: spec.label,
      result: row?.result ?? null,
      note: row?.note ?? null,
      photoUri: row?.photo_key ?? null,
    };
  });
  const passedAt: Date | null = job.pretrip_passed_at ?? null;
  return {
    items,
    passedAt: passedAt ? passedAt.toISOString() : null,
    loggedByLabel: passedAt ? (job.driver_name ?? null) : null,
  };
};

const toAttachment = (a: Record<string, any>): JobAttachment => ({
  id: a.id,
  jobId: a.job_id,
  name: a.name,
  size: humanSize(Number(a.size_bytes)),
  origin: a.origin,
  kind: a.kind,
  step: a.step,
  // Presigned, like every other stored object — an attachment nobody can open
  // is a filename, not a document.
  uri: publicUrl(a.s3_key),
  at: a.created_at ? a.created_at.toISOString() : null,
});

const toPhoto = (p: Record<string, any>): JobPhoto => ({
  id: p.id,
  jobId: p.job_id,
  uri: publicUrl(p.s3_key) ?? "",
  alt: p.alt ?? '',
});

const humanSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * W5's `.timeline`, derived rather than stored: every entry below already has
 * a timestamp somewhere in the schema, so a separate events table would be a
 * second source of truth that could disagree with the first.
 */
const buildTimeline = (
  r: Record<string, any>,
  evidenceRows: Record<string, any>[],
  tz: string,
): TimelineEvent[] => {
  const out: TimelineEvent[] = [];
  const push = (id: string, title: string, at: Date | null, tone: TimelineEvent['tone']) => {
    if (!at) return;
    out.push({ id, title, meta: timeLabel(at, tz), at: at.toISOString(), tone });
  };

  push('created', 'Job created', r.created_at, 'pending');
  push('assigned', 'Assigned to driver', r.assigned_at, 'pending');
  push('pretrip', 'Pre-trip inspection passed', r.pretrip_passed_at, 'progress');

  for (const step of EVIDENCE_STEPS) {
    const forStep = evidenceRows.filter(e => e.step === step);
    const required = forStep.length;
    if (required === 0) continue;
    const last = forStep
      .map(e => e.captured_at as Date)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    push(
      step,
      `${step[0]!.toUpperCase()}${step.slice(1)} evidence captured`,
      last ?? null,
      'progress',
    );
  }

  push('submitted', 'Submitted for approval', r.submitted_at, 'review');
  push('approved', 'Approved and closed', r.approved_at, 'done');
  if (r.status === 'blocked') {
    push('blocked', 'Blocked — unit out of service', r.assigned_at, 'overdue');
  }

  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
};
