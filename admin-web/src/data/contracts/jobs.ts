// Domain: jobs. Shape mirrors the mobile-app copy of this file (plan §2.3) plus
// the web-only mutations (create, approve, sendBack — plan §2.3 "web only").

export type JobStatus =
  | "pending"
  | "in_progress"
  | "awaiting_approval"
  | "done"
  | "blocked"
  | "overdue";

export type JobType = "import" | "export";
export type JobStep = "pretrip" | "pickup" | "load" | "delivery";
export type Priority = "high" | "med" | "low";

export interface JobLeg {
  id: string;
  label: "Pickup" | "Loading" | "Delivery";
  amount: number;
  driverId: string;
}

export interface EvidencePhoto {
  step: Exclude<JobStep, "pretrip">;
  slot: number;
  label: string;
  note: string;
  photoUrl: string | null;
}

export interface JobNote {
  author: string;
  at: string;
  text: string;
}

export interface JobAttachment {
  name: string;
  size: string;
  type: string;
  uploadedBy: string;
  source: string;
  step: string;
  at: string;
}

export interface TimelineEvent {
  id: string;
  title: string;
  meta: string;
  at: string;
  tone: "pending" | "progress" | "review" | "done" | "overdue";
}

export type InspectionResult = "pass" | "defect" | null;

/** The 12-item DOT pre-trip, as the driver actually logged it. */
export interface InspectionItem {
  id: string;
  label: string;
  result: InspectionResult;
  note: string | null;
  photoUri: string | null;
}

export interface Inspection {
  items: InspectionItem[];
  passedAt: string | null;
  loggedByLabel: string | null;
}

export interface Job {
  id: string;
  title: string;
  type: JobType;
  customerId: string;
  driverId: string | null;
  status: JobStatus;
  priority: Priority;
  price: number;
  legs: JobLeg[];
  containerNo: string;
  sealNo: string | null;
  j1Ticket?: string;
  chassisReturnTicket?: string;
  truckId: string;
  chassisId: string;
  pickupLocation: string;
  deliveryLocation: string;
  startDate: string;
  dueDate: string;
  notes: JobNote[];
  attachments: JobAttachment[];
  evidence: EvidencePhoto[];
  timeline: TimelineEvent[];
  /** Null until the driver logs the first item. */
  inspection: Inspection | null;
}

export interface JobFilter {
  status?: JobStatus;
  driverId?: string;
  priority?: Priority;
  query?: string;
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
  legs: Omit<JobLeg, "id">[];
  truckId: string;
  chassisId: string;
  notifyCustomer: boolean;
}

export interface JobsRepo {
  list(filter?: JobFilter): Promise<Job[]>;
  get(id: string): Promise<Job | null>;
  // web only (plan §2.3)
  create(draft: JobDraft): Promise<Job>;
  // W-06 edit — same card, same leg-split validation, mirrors customersRepo.update.
  update(id: string, draft: JobDraft): Promise<Job>;
  approve(id: string): Promise<Job>;
  sendBack(id: string, reason: string): Promise<Job>;
}
