import fixtures from '../fixtures.json';
import type {
  AppNotification,
  Customer,
  Defect,
  Driver,
  Evidence,
  Job,
  JobAttachment,
  JobLeg,
  JobPhoto,
  JobStatus,
  JobStep,
  JobType,
  Message,
  NotificationKind,
  Note,
  PayPeriod,
  PayPeriodStatus,
  Priority,
  Thread,
  Unit,
  UnitKind,
} from '../contracts';
import {
  blankEvidence,
  blankInspection,
  isDueToday,
  isOverdue,
} from '../jobStateMachine';

export const MOCK_TODAY: string = fixtures._meta.today;
export const MOCK_NOW = new Date(`${MOCK_TODAY}T09:41:00-06:00`);

export const delay = (): Promise<void> => Promise.resolve();

export class MockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MockError';
  }
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const customers: Customer[] = fixtures.customers.map(c => ({ ...c }));

const drivers: Driver[] = fixtures.drivers.map(d => ({ ...d }));

const admins = fixtures.admins.map(a => ({ ...a }));

const units: Unit[] = fixtures.fleet.map(u => ({
  id: u.id,
  kind: u.kind as UnitKind,
  outOfService: u.outOfService,
  defectId: 'defectId' in u ? (u.defectId as string) : null,
}));

const defects: Defect[] = fixtures.defects.map(d => ({ ...d }));

const attachments: JobAttachment[] = fixtures.attachments.map(a => ({
  id: a.id,
  jobId: a.jobId,
  name: a.name,
  size: a.size,
  origin: a.origin as 'admin' | 'driver',
  kind: a.kind as 'document' | 'photo',
  step: a.step as JobStep | null,
  uri: null,
}));

const photos: JobPhoto[] = fixtures.photos.map(p => ({ ...p }));

const customerName = (id: string): string =>
  customers.find(c => c.id === id)?.name ?? id;

const hydrateJob = (raw: (typeof fixtures.jobs)[number]): Job => {
  const refs = {
    containerNo: raw.containerNo,
    chassisId: raw.chassisId,
    sealNo: raw.sealNo,
  };
  const evidence: Evidence = blankEvidence(refs);
  return {
    id: raw.id,
    title: raw.title,
    customerId: raw.customerId,
    customerName: customerName(raw.customerId),
    type: raw.type as JobType,
    priority: raw.priority as Priority,
    status: raw.status as JobStatus,
    step: raw.step as JobStep,
    driverId: raw.driverId,
    location: raw.location,
    address: raw.address,
    mapQuery: 'mapQuery' in raw ? (raw.mapQuery as string) : null,
    assignedAt: raw.assignedAt,
    assignedLabel:
      'assignedLabel' in raw ? (raw.assignedLabel as string) : null,
    dueAt: raw.dueAt,
    dueLabel: raw.dueLabel,
    containerNo: raw.containerNo,
    sealNo: raw.sealNo,
    truckId: raw.truckId,
    chassisId: raw.chassisId,
    price: raw.price,
    legs: raw.legs.map(l => ({ ...l } as JobLeg)),
    description: raw.description,
    instructions: raw.instructions,
    photoCount: raw.photoCount,
    inspection: raw.inspection === null ? null : blankInspection(),
    evidence,
    attachments: attachments.filter(a => a.jobId === raw.id),
    photos: photos.filter(p => p.jobId === raw.id),
    submittedAt: raw.submittedAt,
    approvedAt: raw.approvedAt,
    overdue: false,
    dueToday: false,
  };
};

const jobs: Job[] = fixtures.jobs.map(hydrateJob);

const threads: Thread[] = fixtures.threads.map(t => {
  const admin = admins.find(a => a.id === t.adminId);
  return {
    id: t.id,
    jobId: t.jobId,
    jobTitle: jobs.find(j => j.id === t.jobId)?.title ?? t.jobId,
    adminId: t.adminId,
    adminLabel: admin?.label ?? t.adminId,
    adminInitials: admin?.initials ?? '??',
    preview: t.preview,
    whenLabel: t.whenLabel,
    unread: t.unread,
  };
});

const messages: Message[] = fixtures.messages.map(m => ({
  id: m.id,
  threadId: m.threadId,
  from: m.from as 'me' | 'them',
  authorId: m.authorId,
  body: m.body,
  whenLabel: m.whenLabel,
  attachmentUri: m.attachmentUri,
  attachmentName: m.attachmentUri ? 'attachment.jpg' : null,
  attachmentType: m.attachmentUri ? 'image/jpeg' : null,
}));

const notes: Note[] = fixtures.notes.map(n => ({ ...n }));

const notifications: AppNotification[] = fixtures.notifications.map(n => ({
  id: n.id,
  kind: n.kind as NotificationKind,
  title: n.title,
  body: n.body,
  jobId: n.jobId,
  threadId: null,
  group: n.group,
  read: n.read,
}));

const payPeriods: PayPeriod[] = fixtures.payPeriods.map(p => ({
  id: p.id,
  driverId: p.driverId,
  label: p.label,
  subLabel: p.subLabel,
  status: p.status as PayPeriodStatus,
  legCount: p.legCount,
  total: p.total,
  paysOnLabel: p.paysOnLabel,
  paidOnLabel: p.paidOnLabel,
  reference: p.reference,
  method: p.method,
  lines: p.lines.map(l => ({ ...l })),
  remainingLegCount:
    'remainingLegCount' in p ? (p.remainingLegCount as number) : 0,
  remainingTotal: 'remainingTotal' in p ? (p.remainingTotal as number) : 0,
}));

export const db = {
  jobs,
  drivers,
  admins,
  customers,
  units,
  defects,
  threads,
  messages,
  notes,
  notifications,
  payPeriods,
  earningsSummary: { ...fixtures.earningsSummary },
  homeOverview: { ...fixtures.homeOverview },
  credentials: { ...fixtures.auth },
  session: null as { driverId: string; token: string } | null,
  notificationPrefs: {
    job_assigned: true,
    job_updated: true,
    message: true,
    overdue: true,
    approved: true,
    period_paid: true,
    unit_out_of_service: true,
  } as Record<NotificationKind, boolean>,
};

export const readJob = (job: Job): Job =>
  clone({
    ...job,
    overdue: isOverdue(job, MOCK_NOW),
    dueToday: isDueToday(job, MOCK_TODAY),
  });

export const findJob = (id: string): Job => {
  const job = db.jobs.find(j => j.id === id);
  if (!job) {
    throw new MockError(`No job ${id}.`);
  }
  return job;
};

export const commitJob = (next: Job): Job => {
  const i = db.jobs.findIndex(j => j.id === next.id);
  if (i < 0) {
    throw new MockError(`No job ${next.id}.`);
  }
  db.jobs[i] = next;
  return readJob(next);
};

export { clone };

const listeners = new Set<() => void>();

export const subscribeMock = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const notifyMock = (): void => {
  listeners.forEach(listener => listener());
};

export const anyThreadUnread = (): boolean => db.threads.some(t => t.unread > 0);

export const anyNotificationUnread = (): boolean =>
  db.notifications.some(n => !n.read);

export const unreadNotificationCount = (): number =>
  db.notifications.filter(n => !n.read).length;
