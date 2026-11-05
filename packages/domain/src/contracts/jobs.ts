export type JobStatus =
  | 'pending'
  | 'in_progress'
  | 'blocked'
  | 'awaiting_approval'
  | 'done';

export type JobStep = 'pretrip' | 'pickup' | 'load' | 'delivery';

export type EvidenceStep = Exclude<JobStep, 'pretrip'>;

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
  driverLabel: string;
  amount: number;
}

export type InspectionResult = 'pass' | 'defect';

export interface InspectionItem {
  id: string;
  label: string;
  result: InspectionResult | null;
  note: string | null;
  photoUri: string | null;
}

export interface Inspection {
  items: InspectionItem[];
  passedAt: string | null;
  loggedByLabel: string | null;
}

export interface PhotoSlot {
  index: number;
  label: string;
  hint: string;
  uri: string | null;
  uploadProgress: number | null;
  allowUpload: boolean;
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
  at: string | null;
  uri: string | null;
}

export interface JobPhoto {
  id: string;
  jobId: string;
  uri: string;
  alt: string;
}

export interface TimelineEvent {
  id: string;
  title: string;
  meta: string;
  at: string;
  tone: 'pending' | 'progress' | 'review' | 'done' | 'overdue';
}

export interface Job {
  id: string;
  title: string;
  customerId: string;
  customerName: string;
  type: JobType;
  priority: Priority;
  status: JobStatus;
  step: JobStep;
  driverId: string | null;

  location: string;
  address: string;
  mapQuery: string | null;
  pickupLocation: string;
  deliveryLocation: string;

  assignedAt: string;
  assignedLabel: string | null;
  dueAt: string;
  dueLabel: string | null;
  timezone: string;

  containerNo: string | null;
  sealNo: string | null;
  truckId: string | null;
  chassisId: string | null;

  price: number | null;
  legs: JobLeg[];

  description: string | null;
  instructions: string | null;
  photoCount: number;
  inspection: Inspection | null;
  evidence: Evidence;
  attachments: JobAttachment[];
  photos: JobPhoto[];
  timeline: TimelineEvent[];

  submittedAt: string | null;
  approvedAt: string | null;

  overdue: boolean;
  dueToday: boolean;
  version: number;
}

export interface JobFilter {
  status?: JobStatus | JobStatus[];
  driverId?: string;
}

export interface JobsRepo {
  list(filter?: JobFilter): Promise<Job[]>;
  get(id: string): Promise<Job | null>;
}

export interface DriverJobsRepo extends JobsRepo {
  setInspectionItem(
    id: string,
    itemId: string,
    result: InspectionResult,
    note?: string,
    photoUri?: string | null,
  ): Promise<Job>;
  reportDefect(id: string): Promise<Job>;
  setSealNumber(id: string, sealNo: string): Promise<Job>;
  capturePhoto(
    id: string,
    step: EvidenceStep,
    slot: number,
    uri: string,
  ): Promise<Job>;
  deletePhoto(id: string, step: EvidenceStep, slot: number): Promise<Job>;
  addJobPhotos(id: string, uris: string[]): Promise<Job>;
  deleteJobPhoto(id: string, photoId: string): Promise<Job>;
  advance(id: string, step: JobStep): Promise<Job>;
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

export interface AdminJobsRepo extends JobsRepo {
  create(draft: JobDraft): Promise<Job>;
  update(id: string, draft: JobDraft): Promise<Job>;
  approve(id: string): Promise<Job>;
  sendBack(id: string, reason: string): Promise<Job>;
}

