/**
 * Jobs domain contract — the ONE copy (BACKEND_PLAN §1.1).
 *
 * Reconciled from the two drifted copies that were in `mobile-app` and
 * `admin-web`. Where they disagreed, §R at the bottom of this file records
 * which won and why. Nothing here is a new invention: every field came from
 * one of the two originals.
 */

export type JobStatus =
  | 'pending'
  | 'in_progress'
  | 'blocked'
  | 'awaiting_approval'
  | 'done';

/** The four capture steps. `.stepper` renders exactly these, no more. */
export type JobStep = 'pretrip' | 'pickup' | 'load' | 'delivery';

/** The three evidence steps — pre-trip is a checklist, not a photo step. */
export type EvidenceStep = Exclude<JobStep, 'pretrip'>;

/**
 * `.jtype` — 'empty' exists in the CSS for restorability but is DEFERRED and
 * MUST NEVER RENDER (plan §4, §7 mechanical check #4).
 */
export type JobType = 'import' | 'export' | 'empty';

export type Priority = 'high' | 'medium' | 'low';

export type LegKind = 'pickup' | 'loading' | 'delivery';

export const LEG_LABEL: Record<LegKind, string> = {
  pickup: 'Pickup',
  loading: 'Loading',
  delivery: 'Delivery',
};

export interface JobLeg {
  kind: LegKind;
  label: string;
  driverId: string;
  /** 'You' or a driver's short name, as rendered in `.legrow .lc`. */
  driverLabel: string;
  /** Dollars. Stored as integer cents server-side — see §R6. */
  amount: number;
}

export type InspectionResult = 'pass' | 'defect';

export interface InspectionItem {
  id: string;
  label: string;
  result: InspectionResult | null;
  /** REQUIRED when `result === 'defect'`. A ✗ with no note is invalid (§6.1). */
  note: string | null;
  photoUri: string | null;
}

export interface Inspection {
  items: InspectionItem[];
  passedAt: string | null;
  loggedByLabel: string | null;
}

/**
 * One labelled, ordered evidence slot. Slots are NEVER an unlabelled thumbnail
 * grid — the office has to see *which* shot is missing (§6.1).
 */
export interface PhotoSlot {
  index: number;
  /** e.g. '1 · Chassis + container no.' */
  label: string;
  /** The capture hint under the label. */
  hint: string;
  uri: string | null;
  /** 0–100 while uploading, null otherwise. No delete control while uploading. */
  uploadProgress: number | null;
}

export type Evidence = Record<EvidenceStep, PhotoSlot[]>;

export interface JobAttachment {
  id: string;
  jobId: string;
  name: string;
  size: string;
  origin: 'admin' | 'driver';
  kind: 'document' | 'photo';
  step: JobStep | null;
  /** ISO. Admin's attachment history column (W5). */
  at: string | null;
  /** Presigned download URL. Null only if the row lost its key. */
  uri: string | null;
}

export interface JobPhoto {
  id: string;
  jobId: string;
  uri: string;
  alt: string;
}

/** Admin-only: W5's `.timeline`. Derived server-side from job history. */
export interface TimelineEvent {
  id: string;
  title: string;
  meta: string;
  at: string;
  tone: 'pending' | 'progress' | 'review' | 'done' | 'overdue';
}

export interface Job {
  /** Canonical form has NO '#' — that is display chrome (§R1). */
  id: string;
  title: string;
  customerId: string;
  customerName: string;
  type: JobType;
  priority: Priority;
  status: JobStatus;
  /** The step the driver is on now. */
  step: JobStep;
  driverId: string | null;

  /** The driver-facing location for the CURRENT step (M7). Derived (§R5). */
  location: string;
  address: string;
  mapQuery: string | null;
  /** Both ends of the job, as the office enters them (W4). */
  pickupLocation: string;
  deliveryLocation: string;

  assignedAt: string;
  assignedLabel: string | null;
  dueAt: string;
  dueLabel: string | null;
  /** IANA zone the job's calendar is read in — see §R7 and `isDueToday`. */
  timezone: string;

  containerNo: string | null;
  /** Captured by the driver at Confirm pickup (plan §8 Q1 — editable field). */
  sealNo: string | null;
  truckId: string | null;
  chassisId: string | null;

  /** Dollars, read-only for drivers; only admin edits (§6.9). Cents in DB. */
  price: number | null;
  legs: JobLeg[];

  description: string | null;
  instructions: string | null;
  photoCount: number;
  inspection: Inspection | null;
  evidence: Evidence;
  attachments: JobAttachment[];
  photos: JobPhoto[];
  /** Admin-only view (W5). Empty array on the mobile payload. */
  timeline: TimelineEvent[];

  submittedAt: string | null;
  approvedAt: string | null;

  /** DERIVED: past due and not done. Never stored (§R3). */
  overdue: boolean;
  /** DERIVED: due today and not done. M7 inks its Due value with it. */
  dueToday: boolean;
  /** Optimistic-concurrency token. Carry it back on every write. */
  version: number;
}

export interface JobFilter {
  status?: JobStatus | JobStatus[];
  driverId?: string;
}

/** Read surface — identical for both clients. */
export interface JobsRepo {
  list(filter?: JobFilter): Promise<Job[]>;
  get(id: string): Promise<Job | null>;
}

/**
 * Mobile write surface. Note what is ABSENT: there is no `approve` and no
 * `setStatus`. Drivers can never set DONE and can never edit a price (§6.1,
 * §6.6) — the type system, not a screen, is what enforces that.
 */
export interface DriverJobsRepo extends JobsRepo {
  setInspectionItem(
    id: string,
    itemId: string,
    result: InspectionResult,
    note?: string,
    photoUri?: string | null,
  ): Promise<Job>;
  /** Report the defect to dispatch: job → BLOCKED, unit → out of service. */
  reportDefect(id: string): Promise<Job>;
  /** ② Confirm pickup gate: 2 photos AND a non-empty seal number (§8 Q1). */
  setSealNumber(id: string, sealNo: string): Promise<Job>;
  capturePhoto(
    id: string,
    step: EvidenceStep,
    slot: number,
    uri: string,
  ): Promise<Job>;
  /** Deleting a photo re-opens the step and re-locks its button (§6.1). */
  deletePhoto(id: string, step: EvidenceStep, slot: number): Promise<Job>;
  /** M10 loose photos attached to the job, NOT evidence slots. */
  addJobPhotos(id: string, uris: string[]): Promise<Job>;
  deleteJobPhoto(id: string, photoId: string): Promise<Job>;
  /** Advance past a completed step. Throws if the step's gate is not met. */
  advance(id: string, step: JobStep): Promise<Job>;
  /** ④ → AWAITING APPROVAL. The customer email fires HERE (§6.1, §6.8). */
  submit(id: string): Promise<Job>;
}

export interface JobDraft {
  title: string;
  type: JobType;
  customerId: string;
  description: string;
  containerNo: string;
  pickupLocation: string;
  deliveryLocation: string;
  startDate: string;
  dueDate: string;
  priority: Priority;
  price: number;
  legs: Omit<JobLeg, 'label' | 'driverLabel'>[];
  truckId: string;
  chassisId: string;
  notifyCustomer: boolean;
}

/** Admin write surface — implemented by `admin-web` and the API, never mobile. */
export interface AdminJobsRepo extends JobsRepo {
  create(draft: JobDraft): Promise<Job>;
  update(id: string, draft: JobDraft): Promise<Job>;
  approve(id: string): Promise<Job>;
  sendBack(id: string, reason: string): Promise<Job>;
}

/* ───────────────────────────────────────────────────────────────────────────
 * §R · Reconciliation record — what the two copies disagreed on, 2026-08-27.
 *
 * R1 · Job id. mobile `A3-0421`, admin `#A3-0421`. → NO '#'. The hash is
 *      rendered by the UI; storing it makes every id join a string-munge.
 *
 * R2 · Priority. mobile `'medium'`, admin `'med'`. → `'medium'`.
 *      Pure drift, no behaviour either way. Admin fixtures need remapping.
 *
 * R3 · Status `'overdue'`. admin STORED it as a status; mobile derives it.
 *      → DERIVED, admin's stored value dropped. The state machine's invariant
 *      block is explicit: "OVERDUE is DERIVED, never set — past due and not
 *      Done." A stored flag goes stale the moment a due date passes with
 *      nobody writing; a derived one cannot. Admin's StatusPill already maps a
 *      separate `overdue` boolean to the `sp-overdue` tone, so no UI change.
 *
 * R4 · `j1Ticket` / `chassisReturnTicket`. admin-only fields, present in its
 *      fixtures, referenced by NO component. → DROPPED. Plan §8 Q2 resolved
 *      that ticket numbers are photographed, never keyed. They get no column.
 *
 * R5 · Locations. mobile `location`/`address`, admin `pickupLocation`/
 *      `deliveryLocation`. → KEEP BOTH. The admin pair is what the office
 *      enters (W4); the mobile pair is the current step's destination, which
 *      the API derives from the pair + `step`. Neither is redundant.
 *
 * R6 · Money. Contract stays in DOLLARS as `number` so neither client changes.
 *      The DB stores integer cents and the API converts once, at serialize.
 *      ponytail: all arithmetic is server-side in cents; the wire carries
 *      whole-cent dollar values, exact in f64 at these magnitudes.
 *
 * R7 · `timezone`. Neither copy had it. Added because `isDueToday` compares a
 *      calendar day and the device's zone is the wrong clock — see the note on
 *      `isDueToday` in ../jobStateMachine.ts.
 *
 * R8 · Evidence shape. mobile `Record<step, PhotoSlot[]>`, admin flat
 *      `EvidencePhoto[]`. → the slot map. The state machine operates on it,
 *      and admin's W5/W22 group photos by step anyway. Storage is flat rows;
 *      the map is rebuilt on read from SLOT_SPECS.
 *
 * R9 · Fixture datasets. Compared literally the two fixtures.json files share
 *      ZERO job ids — the '#' prefix (R1) makes every one of them differ.
 *      Strip it and they overlap on 11, with admin carrying a 12th (A3-0426).
 *      The seed takes the union: mobile's shape as the base, admin-only fields
 *      merged in. Neither file is authoritative on its own.
 * ─────────────────────────────────────────────────────────────────────────── */
