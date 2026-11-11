import type {
  Evidence,
  EvidenceStep,
  Inspection,
  InspectionItem,
  InspectionResult,
  Job,
  JobStep,
  JobType,
  LegKind,
  PhotoSlot,
} from './contracts/jobs';

export class JobStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobStateError';
  }
}

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
  hint: string;
  blankHint: string;
  allowUpload?: boolean;
}

const CHASSIS_CONTAINER: SlotSpec = {
  label: 'Chassis + container no.',
  hint: 'Both legible in one shot — {chassis} & {container}',
  blankHint: 'Tap to capture — both legible in one shot',
};
const SEAL_IN_HAND: SlotSpec = {
  label: 'Seal in hand',
  hint: 'Held to camera before fitting',
  blankHint: 'Tap to capture — hold the seal to camera before fitting',
};
const SEAL_ON_CONTAINER: SlotSpec = {
  label: 'Seal on container',
  hint: 'Seal on the door with {container} in the shot',
  blankHint: 'Tap to capture — seal on the door, container no. in the shot',
};
const DELIVERY_TICKETS: readonly SlotSpec[] = [
  {
    label: 'J1 ticket',
    hint: 'Container-return interchange ticket, full page',
    allowUpload: true,
    blankHint: 'Tap to capture or upload — container-return interchange ticket, full page',
  },
  {
    label: 'Chassis return ticket',
    hint: 'Chassis-return ticket, full page',
    blankHint: 'Tap to capture — chassis-return ticket, full page',
  },
];
const DELIVERY_UNIT: SlotSpec = {
  label: 'Container + chassis',
  hint: 'Both legible in one shot — {container} & {chassis}',
  blankHint: 'Tap to capture — both legible in one shot',
};

const EXPORT_SPECS: Record<EvidenceStep, readonly SlotSpec[]> = {
  pickup: [CHASSIS_CONTAINER, SEAL_IN_HAND],
  load: [
    {
      label: 'Load, doors open',
      hint: 'Doors open, load visible before sealing',
      blankHint: 'Tap to capture — doors open, load visible before sealing',
    },
    {
      label: 'Bill of lading',
      hint: 'Full page, flat and in focus',
      blankHint: 'Tap to capture — full page, flat and in focus',
    },
    {
      label: 'Seal + chassis no.',
      hint: 'Both legible in one shot — {seal} & {chassis}',
      blankHint: 'Tap to capture — both legible in one shot',
    },
  ],
  delivery: [
    DELIVERY_UNIT,
    {
      label: 'Seal in hand',
      hint: 'Seal cut on arrival, held to camera',
      blankHint: 'Tap to capture — cut the seal and hold it to camera',
    },
    ...DELIVERY_TICKETS,
  ],
};

// ponytail: empty jobs follow the import flow until the client says otherwise
const IMPORT_SPECS: Record<EvidenceStep, readonly SlotSpec[]> = {
  pickup: [CHASSIS_CONTAINER, SEAL_ON_CONTAINER],
  load: [],
  delivery: [DELIVERY_UNIT, SEAL_ON_CONTAINER, ...DELIVERY_TICKETS],
};

const specsFor = (type: JobType, step: EvidenceStep): readonly SlotSpec[] =>
  (type === 'export' ? EXPORT_SPECS : IMPORT_SPECS)[step];

export const slotLabels = (type: JobType, step: EvidenceStep): string[] =>
  specsFor(type, step).map(s => s.label);

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

export const stepOrder = (type: JobType): readonly JobStep[] =>
  type === 'export' ? STEP_ORDER : STEP_ORDER.filter(s => s !== 'load');

export const STEP_LABELS: Record<JobStep, string> = {
  pretrip: 'Pre-trip',
  pickup: 'Pickup',
  load: 'Load',
  delivery: 'Delivery',
};

export const requiredPhotoCount = (type: JobType, step: EvidenceStep): number =>
  specsFor(type, step).length;

export const totalRequiredPhotos = (type: JobType): number =>
  EVIDENCE_STEPS.reduce((n, s) => n + requiredPhotoCount(type, s), 0);

interface UnitRefs {
  type: JobType;
  containerNo: string | null;
  chassisId: string | null;
  sealNo: string | null;
}

const fill = (copy: string, refs: UnitRefs): string =>
  copy
    .replace('{container}', refs.containerNo ?? 'the container no.')
    .replace('{chassis}', refs.chassisId ?? 'the chassis')
    .replace('{seal}', refs.sealNo ?? 'the seal no.');

export const blankSlots = (step: EvidenceStep, refs: UnitRefs): PhotoSlot[] =>
  specsFor(refs.type, step).map((spec, index) => ({
    index,
    label: `${index + 1} · ${spec.label}`,
    hint: fill(spec.blankHint, refs),
    uri: null,
    uploadProgress: null,
    allowUpload: spec.allowUpload === true,
  }));

export const blankEvidence = (refs: UnitRefs): Evidence => ({
  pickup: blankSlots('pickup', refs),
  load: blankSlots('load', refs),
  delivery: blankSlots('delivery', refs),
});

export const capturedHint = (
  step: EvidenceStep,
  index: number,
  refs: UnitRefs,
): string => {
  const spec = specsFor(refs.type, step)[index];
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
  const spec = specsFor(refs.type, step)[index];
  if (!spec) {
    throw new JobStateError(`No slot ${index} on step '${step}'.`);
  }
  return fill(spec.blankHint, refs);
};

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

export interface Gate {
  filled: number;
  required: number;
  satisfied: boolean;
  lockCopy: string | null;
}

export const gate = (job: Job, step: EvidenceStep): Gate => {
  const slots = job.evidence[step];
  const required = requiredPhotoCount(job.type, step);
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

const STEP_LEG: Record<JobStep, LegKind> = {
  pretrip: 'pickup',
  pickup: 'pickup',
  load: 'loading',
  delivery: 'delivery',
};
export const stepDriverId = (job: Job, step: JobStep): string | null =>
  job.legs.find(l => l.kind === STEP_LEG[step])?.driverId || job.driverId;

const nextStep = (type: JobType, step: JobStep): JobStep | null => {
  const order = stepOrder(type);
  const i = order.indexOf(step);
  return i < 0 || i === order.length - 1 ? null : order[i + 1]!;
};

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
  const g = gateFor(job, step);
  if (!g.satisfied) {
    throw new JobStateError(
      g.lockCopy ?? `'${STEP_LABELS[step]}' is not complete yet.`,
    );
  }

  const after = nextStep(job.type, step);
  if (after === null) {
    return job;
  }
  return { ...job, step: after, status: 'in_progress' };
};

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

export const canSubmit = (job: Job): Gate => {
  if (job.step !== 'delivery') {
    return {
      filled: 0,
      required: totalRequiredPhotos(job.type),
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

export const isOverdue = (
  job: Pick<Job, 'dueAt' | 'status'>,
  now: Date = new Date(),
): boolean =>
  job.status !== 'done' && new Date(job.dueAt).getTime() < now.getTime();

export const isDueToday = (
  job: Pick<Job, 'dueAt' | 'status'>,
  today: string,
): boolean => job.status !== 'done' && job.dueAt.slice(0, 10) === today;
