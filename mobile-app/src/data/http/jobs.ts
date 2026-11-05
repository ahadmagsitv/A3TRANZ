import type {
  DriverJobsRepo,
  EvidenceStep,
  InspectionResult,
  Job,
  JobFilter,
  JobStep,
} from '../contracts';
import {api, maybe} from '../api';

export async function uploadTo(
  owner: {jobId: string} | {threadId: string},
  uri: string,
  purpose: 'evidence' | 'job_photo' | 'message',
  step?: EvidenceStep,
  slot?: number,
  contentTypeHint?: string,
): Promise<string> {
  const file = await fetch(uri);
  const blob = await file.blob();
  const contentType = contentTypeHint || blob.type || 'image/jpeg';

  const {key, url, fields} = await api<{
    key: string;
    url: string;
    fields: Record<string, string>;
  }>('/uploads/presign', {
    method: 'POST',
    body: {
      ...owner,
      purpose,
      ...(step ? {step} : {}),
      ...(slot === undefined ? {} : {slot}),
      contentType,
      contentLength: blob.size,
    },
  });

  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    form.append(k, v);
  }
  form.append('file', {
    uri,
    type: contentType,
    name: key.split('/').pop() ?? 'upload',
  } as unknown as Blob);

  const res = await fetch(url, {method: 'POST', body: form});
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status}).`);
  }
  return key;
}

const withPlace = (j: Job): Job => {
  const address = j.address || j.location;
  return {...j, address, mapQuery: j.mapQuery || address || null};
};

const unwrap = (r: {job: Job}): Job => withPlace(r.job);

export const httpJobsRepo: DriverJobsRepo = {
  async list(filter?: JobFilter): Promise<Job[]> {
    const qs = new URLSearchParams();
    const status = filter?.status;
    if (status) {
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
    const all = jobs.map(withPlace);
    return Array.isArray(status)
      ? all.filter(j => status.includes(j.status))
      : all;
  },

  async get(id: string): Promise<Job | null> {
    const r = await maybe(api<{job: Job}>(`/jobs/${id}`));
    return r ? unwrap(r) : null;
  },

  async setInspectionItem(
    id: string,
    itemId: string,
    result: InspectionResult,
    note?: string,
    photoUri?: string | null,
  ): Promise<Job> {
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

  async setSealNumber(id: string, sealNo: string): Promise<Job> {
    return unwrap(
      await api<{job: Job}>(`/jobs/${id}/seal-number`, {
        method: 'POST',
        body: {sealNo},
      }),
    );
  },

  async capturePhoto(
    id: string,
    step: EvidenceStep,
    slot: number,
    uri: string,
  ): Promise<Job> {
    const key = await uploadTo({jobId: id}, uri, 'evidence', step, slot);
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

  async addJobPhotos(id: string, uris: string[]): Promise<Job> {
    const keys = await Promise.all(
      uris.map(uri => uploadTo({jobId: id}, uri, 'job_photo')),
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
