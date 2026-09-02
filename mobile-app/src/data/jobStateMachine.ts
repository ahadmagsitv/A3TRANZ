/**
 * ============================== STATE_MACHINE ==============================
 * IMPLEMENTATION_PLAN §6.1. This block is the shared written spec — the
 * identical comment sits at the top of admin-web's implementation so the two
 * cannot drift silently. Change one, change both.
 *
 *   PENDING ──① PRE-TRIP (12/12 pass) ──▶ IN PROGRESS
 *           └─ any defect ─▶ BLOCKED + unit flagged out of service
 *                            (a defect REQUIRES a note)
 *   IN PROGRESS ──② CONFIRM PICKUP  (2 photos + seal no.)
 *               ──③ CONFIRM LOAD    (3 photos)
 *               ──④ CONFIRM DELIVERY(4 photos) ──▶ AWAITING APPROVAL
 *                                    └─ customer email fires HERE, on SUBMIT
 *   AWAITING APPROVAL ──admin approve (W22)──▶ DONE ──▶ legs accrue to payroll
 *                     └─ admin send back ────▶ IN PROGRESS (customer was
 *                                              already told — warn)
 *
 * Non-negotiable invariants, enforced HERE and not in the screens:
 *   · Drivers can never set DONE. Admin only. (No transition below produces it,
 *     and DriverJobsRepo has no method that could.)
 *   · OVERDUE is DERIVED, never set — past due and not Done.
 *   · A step's primary button is VISIBLE AND LOCKED until every slot is filled.
 *     Never hidden, never removed. `gate()` returns what the lock needs.
 *   · Deleting a photo RE-OPENS the step — slot goes blank, button re-locks.
 *   · A defect ✗ with no note is an invalid state, rejected at this boundary.
 *   · Photo slots are individually labelled and ordered. Never render an
 *     unlabelled thumbnail grid.
 * ===========================================================================
 */

import type {
  Evidence,
  EvidenceStep,
  Inspection,
  InspectionItem,
  InspectionResult,
  Job,
  JobStep,
  PhotoSlot,
} from './contracts/jobs';

export class JobStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobStateError';
  }
}

/** The DOT pre-trip checklist, verbatim from M19. Twelve items, no more. */
export const INSPECTION_ITEMS: readonly { id: string; label: string }[] = [
  { id: 'brakes', label: 'Service brakes & parking brake' },
  { id: 'lights', label: 'Lights & reflectors' },
  { id: 'tires', label: 'Tires, wheels & rims' },
  { id: 'steering', label: 'Steering mechanism' },
  { id: 'coupling', label: 'Coupling devices' },
  { id: 'lines', label: 'Air / hydraulic lines' },
  { id: 'horn', label: 'Horn' },
  { id: 'wipers', label: 'Windshield wipers' },
  { id: 'mirrors', label: 'Mirrors' },
  { id: 'emergency', label: 'Emergency equipment' },
  { id: 'fluids', label: 'Fluid levels' },
  { id: 'frame', label: 'Chassis & frame' },
] as const;

interface SlotSpec {
  label: string;
  /** Copy shown once the shot exists. */
  hint: string;
  /** Copy shown while blank — always starts "Tap to capture" (§6.2). */
  blankHint: string;
}

/**
 * Nine required photos: 2 + 3 + 4. The seal is photographed TWICE — fitted at
 * pickup and cut at delivery — and the two are never collapsed (§7 gate 8).
 * `{container}` / `{chassis}` / `{seal}` interpolate from the job.
 */
const SLOT_SPECS: Record<EvidenceStep, readonly SlotSpec[]> = {
  pickup: [
    {
      label: '1 · Chassis + container no.',
      hint: 'Both legible in one shot — {chassis} & {container}',
      blankHint: 'Tap to capture — both legible in one shot',
    },
    {
      label: '2 · Seal in hand',
      hint: 'Held to camera before fitting',
      blankHint: 'Tap to capture — hold the seal to camera before fitting',
    },
  ],
  load: [
    {
      label: '1 · Seal + chassis no.',
      hint: 'Both legible in one shot — {seal} & {chassis}',
      blankHint: 'Tap to capture — both legible in one shot',
    },
    {
      label: '2 · Bill of lading',
      hint: 'Full page, flat and in focus',
      blankHint: 'Tap to capture — full page, flat and in focus',
    },
    {
      label: '3 · Load, doors open',
      hint: 'Doors open, load visible before sealing',
      blankHint: 'Tap to capture — doors open, load visible before sealing',
    },
  ],
  delivery: [
    {
      label: '1 · Container + chassis',
      hint: 'Container on {chassis} at the delivery point',
      blankHint:
        'Tap to capture — container on the chassis at the delivery point',
    },
    {
      label: '2 · Seal in hand',
      hint: 'Seal cut and held to camera on arrival',
      blankHint: 'Tap to capture — seal cut and held to camera on arrival',
    },
    {
      label: '3 · J1 ticket',
      hint: 'Container-return interchange ticket, full page',
      blankHint:
        'Tap to capture — container-return interchange ticket, full page',
    },
    {
      label: '4 · Chassis return ticket',
      hint: 'Chassis-return ticket, full page',
      blankHint: 'Tap to capture — chassis-return ticket, full page',
    },
  ],
};

export const EVIDENCE_STEPS: readonly EvidenceStep[] = [
  'pickup',
  'load',
  'delivery',
];

export const STEP_ORDER: readonly JobStep[] = [
  'pretrip',
  'pickup',
  'load',
  'delivery',
];

/** `.stepper` labels — four nodes, no more. */
export const STEP_LABELS: Record<JobStep, string> = {
  pretrip: 'Pre-trip',
  pickup: 'Pickup',
  load: 'Load',
  delivery: 'Delivery',
};

export const requiredPhotoCount = (step: EvidenceStep): number =>
  SLOT_SPECS[step].length;

/** Nine, always. 2 + 3 + 4. */
export const TOTAL_REQUIRED_PHOTOS = EVIDENCE_STEPS.reduce(
  (n, s) => n + requiredPhotoCount(s),
  0,
);

interface UnitRefs {
  containerNo: string | null;
  chassisId: string | null;
  sealNo: string | null;
}

const fill = (copy: string, refs: UnitRefs): string =>
  copy
    .replace('{container}', refs.containerNo ?? 'the container no.')
    .replace('{chassis}', refs.chassisId ?? 'the chassis')
    .replace('{seal}', refs.sealNo ?? 'the seal no.');

/** Build the labelled, ordered, empty slot set for one step. */
export const blankSlots = (step: EvidenceStep, refs: UnitRefs): PhotoSlot[] =>
  SLOT_SPECS[step].map((spec, index) => ({
    index,
    label: spec.label,
    hint: fill(spec.blankHint, refs),
    uri: null,
    uploadProgress: null,
  }));

export const blankEvidence = (refs: UnitRefs): Evidence => ({
  pickup: blankSlots('pickup', refs),
  load: blankSlots('load', refs),
  delivery: blankSlots('delivery', refs),
});

/** The captured-state hint for a slot, once it has a photo. */
export const capturedHint = (
  step: EvidenceStep,
  index: number,
  refs: UnitRefs,
): string => {
  const spec = SLOT_SPECS[step][index];
  if (!spec) {
    throw new JobStateError(`No slot ${index} on step '${step}'.`);
  }
  return fill(spec.hint, refs);
};

export const blankHint = (
  step: EvidenceStep,
  index: number,
  refs: UnitRefs,
): string => {
  const spec = SLOT_SPECS[step][index];
  if (!spec) {
    throw new JobStateError(`No slot ${index} on step '${step}'.`);
  }
  return fill(spec.blankHint, refs);
};

// ─────────────────────────── ① Pre-trip inspection ───────────────────────────

export const blankInspection = (): Inspection => ({
  items: INSPECTION_ITEMS.map(i => ({
    id: i.id,
    label: i.label,
    result: null,
    note: null,
    photoUri: null,
  })),
  passedAt: null,
  loggedByLabel: null,
});

export interface InspectionState {
  checked: number;
  total: number;
  defects: InspectionItem[];
  allPass: boolean;
}

export const inspectionState = (
  inspection: Inspection | null,
): InspectionState => {
  const items = inspection?.items ?? [];
  const checked = items.filter(i => i.result !== null).length;
  const defects = items.filter(i => i.result === 'defect');
  return {
    checked,
    total: INSPECTION_ITEMS.length,
    defects,
    allPass:
      items.length === INSPECTION_ITEMS.length &&
      checked === INSPECTION_ITEMS.length &&
      defects.length === 0,
  };
};

/**
 * A ✗ with no note is an invalid state and is rejected HERE, not by the screen.
 * Returns the note to store.
 */
export const validateInspectionItem = (
  result: InspectionResult,
  note?: string,
): string | null => {
  if (result === 'pass') {
    return null;
  }
  const trimmed = (note ?? '').trim();
  if (trimmed.length === 0) {
    throw new JobStateError(
      'A defect needs a note describing it before it can be reported.',
    );
  }
  return trimmed;
};

// ──────────────────────────── Gates ②③④ ────────────────────────────

export interface Gate {
  /** How many slots are filled. */
  filled: number;
  /** How many the step needs. */
  required: number;
  /** True when the step's primary button unlocks. */
  satisfied: boolean;
  /** The "n of m" line rendered beneath a LOCKED button. Never hide the button. */
  lockCopy: string | null;
}

/**
 * Confirm pickup additionally needs a non-empty seal number (§8 Q1, resolved).
 */
export const gate = (job: Job, step: EvidenceStep): Gate => {
  const slots = job.evidence[step];
  const required = requiredPhotoCount(step);
  const filled = slots.filter(s => s.uri !== null).length;
  const missing = required - filled;
  const needsSeal = step === 'pickup' && (job.sealNo ?? '').trim().length === 0;

  if (missing > 0) {
    return {
      filled,
      required,
      satisfied: false,
      lockCopy: `${missing} photo${missing === 1 ? '' : 's'} still to capture`,
    };
  }
  if (needsSeal) {
    return {
      filled,
      required,
      satisfied: false,
      lockCopy: 'Enter the seal number to confirm pickup',
    };
  }
  return { filled, required, satisfied: true, lockCopy: null };
};

/** ① is gated on the checklist, not on photos. */
export const pretripGate = (job: Job): Gate => {
  const s = inspectionState(job.inspection);
  if (s.defects.length > 0) {
    return {
      filled: s.checked,
      required: s.total,
      satisfied: false,
      lockCopy: `Job cannot start — ${s.defects.length} defect${
        s.defects.length === 1 ? '' : 's'
      } reported`,
    };
  }
  return {
    filled: s.checked,
    required: s.total,
    satisfied: s.allPass,
    lockCopy: s.allPass ? null : `Complete all ${s.total} checks to start`,
  };
};

export const gateFor = (job: Job, step: JobStep): Gate =>
  step === 'pretrip' ? pretripGate(job) : gate(job, step);

// ──────────────────────────── Transitions ────────────────────────────

const nextStep = (step: JobStep): JobStep | null => {
  const i = STEP_ORDER.indexOf(step);
  return i < 0 || i === STEP_ORDER.length - 1 ? null : STEP_ORDER[i + 1]!;
};

/**
 * Advance past a completed step. Throws if its gate is not met, if the job is
 * blocked, or if the step is not the one the driver is actually on.
 * Never produces DONE — that transition does not exist on this side.
 */
export const advance = (job: Job, step: JobStep): Job => {
  if (job.status === 'blocked') {
    throw new JobStateError(
      'This job is blocked — the unit is out of service and dispatch has been notified.',
    );
  }
  if (job.status === 'awaiting_approval' || job.status === 'done') {
    throw new JobStateError('This job is already with the office.');
  }
  if (job.step !== step) {
    throw new JobStateError(
      `Step out of order: the job is on '${job.step}', not '${step}'.`,
    );
  }
  if (!gateFor(job, step).satisfied) {
    throw new JobStateError(`'${STEP_LABELS[step]}' is not complete yet.`);
  }

  const after = nextStep(step);
  if (after === null) {
    // ④ complete — the driver still has to SUBMIT. Advancing does not submit.
    return job;
  }
  return { ...job, step: after, status: 'in_progress' };
};

/** ① defect path: BLOCKED + the unit goes out of service. */
export const reportDefect = (job: Job): Job => {
  const s = inspectionState(job.inspection);
  if (s.defects.length === 0) {
    throw new JobStateError('There is no defect to report.');
  }
  const unnoted = s.defects.find(d => (d.note ?? '').trim().length === 0);
  if (unnoted) {
    throw new JobStateError(
      `'${unnoted.label}' is marked as a defect but has no note.`,
    );
  }
  return { ...job, status: 'blocked' };
};

/**
 * ④ → AWAITING APPROVAL. Requires every one of the nine photos.
 * The customer email fires on THIS transition, not on admin approval (§6.8).
 */
export const canSubmit = (job: Job): Gate => {
  if (job.step !== 'delivery') {
    return {
      filled: 0,
      required: TOTAL_REQUIRED_PHOTOS,
      satisfied: false,
      lockCopy: 'Finish the earlier steps first',
    };
  }
  return gate(job, 'delivery');
};

export const submit = (job: Job): Job => {
  const g = canSubmit(job);
  if (!g.satisfied) {
    throw new JobStateError(g.lockCopy ?? 'This closeout is not complete yet.');
  }
  const missing = EVIDENCE_STEPS.filter(s =>
    job.evidence[s].some(slot => slot.uri === null),
  );
  if (missing.length > 0) {
    throw new JobStateError(
      `Evidence is missing on: ${missing.map(s => STEP_LABELS[s]).join(', ')}.`,
    );
  }
  return {
    ...job,
    status: 'awaiting_approval',
    submittedAt: new Date().toISOString(),
  };
};

// ───────────────────────── Photo capture / delete ─────────────────────────

const replaceSlot = (
  job: Job,
  step: EvidenceStep,
  index: number,
  next: PhotoSlot,
): Job => ({
  ...job,
  evidence: {
    ...job.evidence,
    [step]: job.evidence[step].map(s => (s.index === index ? next : s)),
  },
});

export const capturePhoto = (
  job: Job,
  step: EvidenceStep,
  index: number,
  uri: string,
): Job => {
  const slot = job.evidence[step].find(s => s.index === index);
  if (!slot) {
    throw new JobStateError(`No slot ${index} on step '${step}'.`);
  }
  return replaceSlot(job, step, index, {
    ...slot,
    uri,
    uploadProgress: null,
    hint: capturedHint(step, index, job),
  });
};

/**
 * Deleting a photo RE-OPENS the step: the slot goes blank and the step's button
 * re-locks (which `gate()` now reports). If the job had already been submitted
 * on this evidence it drops back to IN PROGRESS — evidence and status cannot
 * disagree.
 */
export const deletePhoto = (
  job: Job,
  step: EvidenceStep,
  index: number,
): Job => {
  const slot = job.evidence[step].find(s => s.index === index);
  if (!slot) {
    throw new JobStateError(`No slot ${index} on step '${step}'.`);
  }
  if (slot.uri === null) {
    throw new JobStateError('There is no photo in that slot.');
  }
  const reopened = replaceSlot(job, step, index, {
    ...slot,
    uri: null,
    uploadProgress: null,
    hint: blankHint(step, index, job),
  });
  return job.status === 'awaiting_approval'
    ? { ...reopened, status: 'in_progress', step, submittedAt: null }
    : reopened;
};

// ──────────────────────────── Derived state ────────────────────────────

/** OVERDUE is derived, never set: past due and not Done. */
export const isOverdue = (
  job: Pick<Job, 'dueAt' | 'status'>,
  now: Date = new Date(),
): boolean =>
  job.status !== 'done' && new Date(job.dueAt).getTime() < now.getTime();

/**
 * Also derived. M7 inks its "Due" value with `--st-overdue-ink` on a job that
 * is due today but not yet late — urgency the OVERDUE flag alone cannot carry.
 *
 * `today` is a calendar day (`YYYY-MM-DD`) in the JOB's timezone, not a
 * `Date`. Comparing `Date` fields would read the device's calendar instead:
 * a phone five hours east of Houston turns a job due at 17:00 local into
 * tomorrow's job, and the urgency ink silently disappears.
 */
export const isDueToday = (
  job: Pick<Job, 'dueAt' | 'status'>,
  today: string,
): boolean => job.status !== 'done' && job.dueAt.slice(0, 10) === today;
