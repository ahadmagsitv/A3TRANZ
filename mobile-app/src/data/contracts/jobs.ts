/**
 * Jobs domain contract — the swap point (IMPLEMENTATION_PLAN §2.3).
 *
 * UI never imports from `data/mock/`. When a real API lands, one import per
 * domain changes. No factory, no DI container, no adapter layer.
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
 * MUST NEVER RENDER (§4, §7 mechanical check #4).
 */
export type JobType = 'import' | 'export' | 'empty';

export type Priority = 'high' | 'medium' | 'low';

export type LegKind = 'pickup' | 'loading' | 'delivery';

export interface JobLeg {
  kind: LegKind;
  label: string;
  driverId: string;
  /** 'You' or a driver's short name, as rendered in `.legrow .lc`. */
  driverLabel: string;
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
}

export interface JobPhoto {
  id: string;
  jobId: string;
  uri: string;
  alt: string;
}

export interface Job {
  id: string;
  title: string;
  customerId: string;
  customerName: string;
  type: JobType;
  priority: Priority;
  status: JobStatus;
  /** The step the driver is on now. */
  step: JobStep;
  driverId: string;
  location: string;
  address: string;
  mapQuery: string | null;
  assignedAt: string;
  assignedLabel: string | null;
  dueAt: string;
  dueLabel: string | null;
  containerNo: string | null;
  /** Captured by the driver at Confirm pickup (§8 Q1 — editable field). */
  sealNo: string | null;
  truckId: string | null;
  chassisId: string | null;
  /** Job price. Drivers see it read-only; only admin edits (§6.9). */
  price: number | null;
  legs: JobLeg[];
  description: string | null;
  instructions: string | null;
  photoCount: number;
  inspection: Inspection | null;
  evidence: Evidence;
  attachments: JobAttachment[];
  photos: JobPhoto[];
  submittedAt: string | null;
  approvedAt: string | null;
  /** DERIVED: past due and not done. Never set directly (§6.1). */
  overdue: boolean;
  /** DERIVED: due today and not done. M7 inks its Due value with it. */
  dueToday: boolean;
}

export interface JobFilter {
  status?: JobStatus | JobStatus[];
  driverId?: string;
}

/** Read surface — identical in both projects. */
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
  /**
   * ① Pre-trip. A 'defect' with a blank note is rejected at this boundary.
   * `photoUri` is the optional shot from the note's "Add photo" control; it
   * travels with the defect into the fleet record, which is what W18 quotes.
   */
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
  /**
   * M10 "Upload work" — loose photos attached to the job, NOT evidence slots.
   * Evidence is captured through `capturePhoto` into a labelled slot; these are
   * the extra shots a driver chooses to send. §8 Q5: a driver may delete any
   * photo they uploaded; documents are download-only.
   */
  addJobPhotos(id: string, uris: string[]): Promise<Job>;
  deleteJobPhoto(id: string, photoId: string): Promise<Job>;
  /** Advance past a completed step. Throws if the step's gate is not met. */
  advance(id: string, step: JobStep): Promise<Job>;
  /** ④ → AWAITING APPROVAL. The customer email fires HERE (§6.1, §6.8). */
  submit(id: string): Promise<Job>;
}

/**
 * Admin write surface — declared here so both projects read one spec, but NOT
 * implemented on mobile. `admin-web` implements this half.
 */
export interface AdminJobsRepo extends JobsRepo {
  create(draft: unknown): Promise<Job>;
  approve(id: string): Promise<Job>;
  sendBack(id: string, reason: string): Promise<Job>;
}
