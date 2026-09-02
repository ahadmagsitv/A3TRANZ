import type {
  DriverJobsRepo,
  EvidenceStep,
  InspectionResult,
  Job,
  JobFilter,
  JobStep,
} from '../contracts';
import {api, maybe} from '../api';

/**
 * Photo bytes never travel through a JSON route.
 *
 * The server names the destination (`/uploads/presign`), the device PUTs the
 * file straight there, and only the resulting KEY goes into the job. That is
 * why capture is three calls and not one, and why the client never gets blanket
 * write access to the bucket.
 */
async function upload(
  jobId: string,
  uri: string,
  purpose: 'evidence' | 'job_photo',
  step?: EvidenceStep,
  slot?: number,
): Promise<string> {
  const file = await fetch(uri);
  const blob = await file.blob();
  const contentType = blob.type || 'image/jpeg';

  const {key, url} = await api<{key: string; url: string}>('/uploads/presign', {
    method: 'POST',
    body: {
      jobId,
      purpose,
      ...(step ? {step} : {}),
      ...(slot === undefined ? {} : {slot}),
      contentType,
      contentLength: blob.size,
    },
  });

  const res = await fetch(url, {
    method: 'PUT',
    headers: {'content-type': contentType},
    body: blob,
  });
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status}).`);
  }
  return key;
}

const unwrap = (r: {job: Job}): Job => r.job;

export const httpJobsRepo: DriverJobsRepo = {
  async list(filter?: JobFilter): Promise<Job[]> {
    const qs = new URLSearchParams();
    const status = filter?.status;
    if (status) {
      // The server takes one status; the segmented control asks for several,
      // so a multi-status filter is applied here instead of round-tripping.
      if (!Array.isArray(status)) {
        qs.set('status', status);
      }
    }
    if (filter?.driverId) {
      qs.set('driverId', filter.driverId);
    }
    const {jobs} = await api<{jobs: Job[]}>(
      `/jobs${qs.toString() ? `?${qs}` : ''}`,
    );
    return Array.isArray(status)
      ? jobs.filter(j => status.includes(j.status))
      : jobs;
  },

  async get(id: string): Promise<Job | null> {
    const r = await maybe(api<{job: Job}>(`/jobs/${id}`));
    return r ? r.job : null;
  },

  // ── ① pre-trip ───────────────────────────────────────────────────────────

  async setInspectionItem(
    id: string,
    itemId: string,
    result: InspectionResult,
    note?: string,
    photoUri?: string | null,
  ): Promise<Job> {
    // A defect with a blank note is refused server-side too — this is not the
    // only thing standing between a ✗ and an unexplained out-of-service unit.
    return unwrap(
      await api<{job: Job}>(`/jobs/${id}/inspection/${itemId}`, {
        method: 'POST',
        body: {result, note, photoUri},
      }),
    );
  },

  async reportDefect(id: string): Promise<Job> {
    return unwrap(
      await api<{job: Job}>(`/jobs/${id}/report-defect`, {method: 'POST'}),
    );
  },

  // ── ② confirm pickup ─────────────────────────────────────────────────────

  async setSealNumber(id: string, sealNo: string): Promise<Job> {
    return unwrap(
      await api<{job: Job}>(`/jobs/${id}/seal-number`, {
        method: 'POST',
        body: {sealNo},
      }),
    );
  },

  // ── evidence ─────────────────────────────────────────────────────────────

  async capturePhoto(
    id: string,
    step: EvidenceStep,
    slot: number,
    uri: string,
  ): Promise<Job> {
    const key = await upload(id, uri, 'evidence', step, slot);
    return unwrap(
      await api<{job: Job}>(`/jobs/${id}/evidence/${step}/${slot}`, {
        method: 'POST',
        body: {key},
      }),
    );
  },

  async deletePhoto(id: string, step: EvidenceStep, slot: number): Promise<Job> {
    return unwrap(
      await api<{job: Job}>(`/jobs/${id}/evidence/${step}/${slot}`, {
        method: 'DELETE',
      }),
    );
  },

  // ── M10 loose photos (not evidence slots) ────────────────────────────────

  async addJobPhotos(id: string, uris: string[]): Promise<Job> {
    const keys = await Promise.all(
      uris.map(uri => upload(id, uri, 'job_photo')),
    );
    return unwrap(
      await api<{job: Job}>(`/jobs/${id}/photos`, {
        method: 'POST',
        body: {keys},
      }),
    );
  },

  async deleteJobPhoto(id: string, photoId: string): Promise<Job> {
    return unwrap(
      await api<{job: Job}>(`/jobs/${id}/photos/${photoId}`, {method: 'DELETE'}),
    );
  },

  // ── gates ────────────────────────────────────────────────────────────────

  async advance(id: string, step: JobStep): Promise<Job> {
    return unwrap(
      await api<{job: Job}>(`/jobs/${id}/advance`, {
        method: 'POST',
        body: {step},
      }),
    );
  },

  async submit(id: string): Promise<Job> {
    return unwrap(await api<{job: Job}>(`/jobs/${id}/submit`, {method: 'POST'}));
  },
};
