import type {
  DriverJobsRepo,
  EvidenceStep,
  InspectionResult,
  Job,
  JobFilter,
  JobStep,
} from '../contracts';
import { commitJob, db, delay, findJob, readJob } from './db';
import {
  advance as smAdvance,
  blankInspection,
  capturePhoto as smCapture,
  deletePhoto as smDelete,
  inspectionState,
  JobStateError,
  reportDefect as smReportDefect,
  submit as smSubmit,
  validateInspectionItem,
} from '../jobStateMachine';

const matches = (job: Job, filter?: JobFilter): boolean => {
  if (!filter) {
    return true;
  }
  if (filter.driverId && job.driverId !== filter.driverId) {
    return false;
  }
  if (filter.status) {
    const wanted = Array.isArray(filter.status)
      ? filter.status
      : [filter.status];
    if (!wanted.includes(job.status)) {
      return false;
    }
  }
  return true;
};

export const mockJobsRepo: DriverJobsRepo = {
  async list(filter) {
    await delay();
    return db.jobs.filter(j => matches(j, filter)).map(readJob);
  },

  async get(id) {
    await delay();
    const job = db.jobs.find(j => j.id === id);
    return job ? readJob(job) : null;
  },

  async setInspectionItem(
    id: string,
    itemId: string,
    result: InspectionResult,
    note?: string,
    photoUri?: string | null,
  ) {
    await delay();
    const job = findJob(id);
    // A ✗ with no note never reaches the store.
    const kept = validateInspectionItem(result, note);
    const inspection = job.inspection ?? blankInspection();
    const items = inspection.items.map(i =>
      i.id === itemId
        ? {
            ...i,
            result,
            note: kept,
            // A pass clears any shot that was attached to a previous defect.
            photoUri: result === 'pass' ? null : photoUri ?? i.photoUri,
          }
        : i,
    );
    if (!items.some(i => i.id === itemId)) {
      throw new JobStateError(`No inspection item '${itemId}'.`);
    }
    const state = inspectionState({ ...inspection, items });
    return commitJob({
      ...job,
      inspection: {
        ...inspection,
        items,
        passedAt: state.allPass ? new Date().toISOString() : null,
        loggedByLabel: state.allPass
          ? `Logged as ${
              db.drivers.find(d => d.id === job.driverId)?.name ?? 'driver'
            }`
          : null,
      },
    });
  },

  async reportDefect(id: string) {
    await delay();
    const job = smReportDefect(findJob(id));

    // §6.1 — the unit goes out of service, and the defect is the legal record.
    const unitId = job.truckId;
    const defectItem = inspectionState(job.inspection).defects[0];
    if (unitId && defectItem) {
      const defectId = `DEF-${job.id}-${defectItem.id}`;
      db.defects.push({
        id: defectId,
        unitId,
        jobId: job.id,
        item: defectItem.label,
        note: defectItem.note ?? '',
        reportedBy: job.driverId,
        reportedAt: new Date().toISOString(),
        photoUri: defectItem.photoUri,
      });
      const unit = db.units.find(u => u.id === unitId);
      if (unit) {
        unit.outOfService = true;
        unit.defectId = defectId;
      }
      db.notifications.unshift({
        id: `NOT-${Date.now()}`,
        kind: 'unit_out_of_service',
        title: 'Unit taken out of service',
        body: `${unitId} · ${defectItem.label}`,
        jobId: job.id,
        group: 'Today',
        read: false,
      });
    }
    return commitJob(job);
  },

  async setSealNumber(id: string, sealNo: string) {
    await delay();
    const job = findJob(id);
    const trimmed = sealNo.trim();
    if (trimmed.length === 0) {
      throw new JobStateError(
        'Enter the seal number before confirming pickup.',
      );
    }
    return commitJob({ ...job, sealNo: trimmed });
  },

  async capturePhoto(
    id: string,
    step: EvidenceStep,
    slot: number,
    uri: string,
  ) {
    await delay();
    return commitJob(smCapture(findJob(id), step, slot, uri));
  },

  async deletePhoto(id: string, step: EvidenceStep, slot: number) {
    await delay();
    return commitJob(smDelete(findJob(id), step, slot));
  },

  /**
   * M10. Loose photos, not evidence — they never satisfy a step gate, so this
   * deliberately does NOT touch `job.evidence` or `job.step`.
   */
  async addJobPhotos(id: string, uris: string[]) {
    await delay();
    const job = findJob(id);
    const clean = uris.map(u => u.trim()).filter(u => u.length > 0);
    if (clean.length === 0) {
      throw new JobStateError('Pick at least one photo to upload.');
    }
    const added = clean.map((uri, i) => ({
      id: `PHO-${Date.now()}-${i}`,
      jobId: job.id,
      uri,
      alt: 'Photo uploaded by the driver',
    }));
    return commitJob({
      ...job,
      photos: [...job.photos, ...added],
      photoCount: job.photoCount + added.length,
    });
  },

  async deleteJobPhoto(id: string, photoId: string) {
    await delay();
    const job = findJob(id);
    if (!job.photos.some(p => p.id === photoId)) {
      throw new JobStateError('That photo is not on this job.');
    }
    return commitJob({
      ...job,
      photos: job.photos.filter(p => p.id !== photoId),
      photoCount: Math.max(0, job.photoCount - 1),
    });
  },

  async advance(id: string, step: JobStep) {
    await delay();
    return commitJob(smAdvance(findJob(id), step));
  },

  async submit(id: string) {
    await delay();
    const job = smSubmit(findJob(id));

    // §6.8 — the customer email fires HERE, on driver submit, not on approval.
    const customer = db.customers.find(c => c.id === job.customerId);
    if (customer?.notifyOnCompletion) {
      customerEmails.push({
        jobId: job.id,
        customerId: customer.id,
        sentAt: new Date().toISOString(),
      });
    }
    db.notifications.unshift({
      id: `NOT-${Date.now()}`,
      kind: 'job_updated',
      title: 'Closeout submitted',
      body: `#${job.id} · awaiting approval`,
      jobId: job.id,
      group: 'Today',
      read: false,
    });
    return commitJob(job);
  },
};

/** The one outbound customer email. W22 renders the record of it. */
export const customerEmails: {
  jobId: string;
  customerId: string;
  sentAt: string;
}[] = [];
