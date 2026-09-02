import type {
  EvidencePhoto,
  Job,
  JobAttachment,
  JobDraft,
  JobFilter,
  JobLeg,
  JobNote,
  Inspection,
  JobStep,
  JobsRepo,
  Priority,
  TimelineEvent,
} from "@/data/contracts/jobs";
import { api, maybe } from "./api";
import { relative } from "./format";

/**
 * The two vocabularies that differ between the wire and these screens:
 * priority ("medium" vs "med") and legs (a `kind` vs the rendered label).
 * Both are mapped here so no component has to know there are two spellings.
 */
const PRIORITY_IN: Record<string, Priority> = { high: "high", medium: "med", low: "low" };
const PRIORITY_OUT: Record<Priority, string> = { high: "high", med: "medium", low: "low" };
const LEG_KIND: Record<string, JobLeg["label"]> = {
  pickup: "Pickup",
  loading: "Loading",
  delivery: "Delivery",
};
const LEG_LABEL_OUT: Record<string, string> = {
  Pickup: "pickup",
  Loading: "loading",
  Delivery: "delivery",
};

interface ApiLeg {
  kind: string;
  driverId: string | null;
  amount: number;
}
interface ApiSlot {
  index: number;
  label: string;
  hint: string;
  uri: string | null;
}
interface ApiAttachment {
  name: string;
  size: string;
  origin: string;
  kind: string;
  step: string | null;
  at: string;
}
interface ApiNote {
  authorName: string;
  at: string;
  body: string;
}
interface ApiJob {
  id: string;
  title: string;
  type: "import" | "export";
  customerId: string;
  driverId: string | null;
  status: Job["status"];
  priority: string;
  price: number | null;
  legs: ApiLeg[];
  containerNo: string | null;
  sealNo: string | null;
  truckId: string | null;
  chassisId: string | null;
  pickupLocation: string;
  deliveryLocation: string;
  assignedAt: string | null;
  dueAt: string | null;
  attachments?: ApiAttachment[];
  evidence?: Record<string, ApiSlot[]>;
  timeline?: TimelineEvent[];
  inspection?: Inspection | null;
}

/**
 * Only slots that actually hold a photo. The API returns every slot, empty
 * ones included, because the driver app renders them as capture targets; the
 * admin screens count this array against the expected total ("3 of 4 photos"),
 * so carrying the empties would report every job as complete.
 */
const toEvidence = (evidence: Record<string, ApiSlot[]> | undefined): EvidencePhoto[] =>
  Object.entries(evidence ?? {}).flatMap(([step, slots]) =>
    slots
      .filter((s) => s.uri)
      .map((s) => ({
        step: step as Exclude<JobStep, "pretrip">,
        slot: s.index,
        label: s.label,
        note: s.hint,
        photoUrl: s.uri,
      })),
  );

const toAttachment = (a: ApiAttachment): JobAttachment => ({
  name: a.name,
  size: a.size,
  type: a.kind,
  uploadedBy: a.origin,
  source: a.origin,
  step: a.step ?? "",
  at: relative(a.at),
});

const toJob = (j: ApiJob, notes: JobNote[] = []): Job => ({
  id: j.id,
  title: j.title,
  type: j.type,
  customerId: j.customerId,
  driverId: j.driverId,
  status: j.status,
  priority: PRIORITY_IN[j.priority] ?? "med",
  price: j.price ?? 0,
  legs: j.legs.map((l, i) => ({
    id: `${j.id}-${l.kind}-${i}`,
    label: LEG_KIND[l.kind] ?? "Pickup",
    amount: l.amount,
    driverId: l.driverId ?? "",
  })),
  containerNo: j.containerNo ?? "",
  sealNo: j.sealNo,
  truckId: j.truckId ?? "",
  chassisId: j.chassisId ?? "",
  pickupLocation: j.pickupLocation,
  deliveryLocation: j.deliveryLocation,
  // Parsed and `.slice(0, 10)`d by the screens, so these stay ISO.
  startDate: j.assignedAt ?? "",
  dueDate: j.dueAt ?? "",
  notes,
  attachments: (j.attachments ?? []).map(toAttachment),
  evidence: toEvidence(j.evidence),
  timeline: j.timeline ?? [],
  inspection: j.inspection ?? null,
});

const draftBody = (d: JobDraft) => ({
  title: d.title,
  type: d.type,
  customerId: d.customerId,
  description: d.description,
  containerNo: d.containerNo,
  pickupLocation: d.pickupLocation,
  deliveryLocation: d.deliveryLocation,
  startDate: d.startDate,
  dueDate: d.dueDate,
  priority: PRIORITY_OUT[d.priority],
  price: d.price,
  legs: d.legs.map((l) => ({
    kind: LEG_LABEL_OUT[l.label] ?? "pickup",
    driverId: l.driverId,
    amount: l.amount,
  })),
  truckId: d.truckId || null,
  chassisId: d.chassisId || null,
  notifyCustomer: d.notifyCustomer,
});

/** The detail screens read notes; the table does not, so only `get` pays. */
async function notesFor(id: string): Promise<JobNote[]> {
  const { notes } = await api<{ notes: ApiNote[] }>(`/jobs/${id}/notes`);
  return notes.map((n) => ({ author: n.authorName, at: relative(n.at), text: n.body }));
}

export const jobsRepo: JobsRepo = {
  async list(filter?: JobFilter): Promise<Job[]> {
    const qs = new URLSearchParams();
    if (filter?.status) qs.set("status", filter.status);
    if (filter?.driverId) qs.set("driverId", filter.driverId);
    if (filter?.priority) qs.set("priority", PRIORITY_OUT[filter.priority]);
    if (filter?.query) qs.set("q", filter.query);
    const suffix = qs.toString() ? `?${qs}` : "";
    const { jobs } = await api<{ jobs: ApiJob[] }>(`/jobs${suffix}`);
    return jobs.map((j) => toJob(j));
  },

  async get(id: string): Promise<Job | null> {
    const r = await maybe(api<{ job: ApiJob }>(`/jobs/${id}`));
    return r ? toJob(r.job, await notesFor(id)) : null;
  },

  async create(draft: JobDraft): Promise<Job> {
    const { job } = await api<{ job: ApiJob }>("/jobs", {
      method: "POST",
      body: draftBody(draft),
    });
    return toJob(job);
  },

  async update(id: string, draft: JobDraft): Promise<Job> {
    const { job } = await api<{ job: ApiJob }>(`/jobs/${id}`, {
      method: "PUT",
      body: draftBody(draft),
    });
    return toJob(job, await notesFor(id));
  },

  async approve(id: string): Promise<Job> {
    const { job } = await api<{ job: ApiJob }>(`/jobs/${id}/approve`, { method: "POST" });
    return toJob(job, await notesFor(id));
  },

  async sendBack(id: string, reason: string): Promise<Job> {
    const { job } = await api<{ job: ApiJob }>(`/jobs/${id}/send-back`, {
      method: "POST",
      body: { reason },
    });
    return toJob(job, await notesFor(id));
  },
};
