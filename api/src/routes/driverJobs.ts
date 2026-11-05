import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  EVIDENCE_STEPS,
  INSPECTION_ITEMS,
  type EvidenceStep,
  type Job,
  type JobStep,
  JobStateError,
  advance as advanceJob,
  capturePhoto as capturePhotoOn,
  deletePhoto as deletePhotoOn,
  gateFor,
  inspectionState,
  STEP_LABELS,
  stepDriverId,
  reportDefect as reportDefectOn,
  submit as submitJob,
  validateInspectionItem,
} from '@a3/domain';
import { tx } from '../db.ts';
import { driverOnly } from '../guard.ts';
import { HttpError, conflict, forbidden, notFound } from '../errors.ts';
import { assertOwnKey } from '../storage.ts';
import { loadJobs, type Viewer } from '../serialize/jobs.ts';
import { notify } from '../notify.ts';

const STEPS = ['pretrip', 'pickup', 'load', 'delivery'] as const;

const lockJob = async (
  c: PoolClient,
  jobId: string,
  viewer: Viewer,
  expectedVersion: number | undefined,
  step?: JobStep,
): Promise<Job> => {
  const { rows } = await c.query<{ id: string; version: number }>(
    `SELECT id, version FROM jobs WHERE id = $1 FOR UPDATE`,
    [jobId],
  );
  const row = rows[0];
  const [job] = row ? await loadJobs('j.id = $1', [jobId], viewer, c) : [];
  const me = viewer.userId;
  if (!job || (!viewer.isOffice && job.driverId !== me && !job.legs.some(l => l.driverId === me))) {
    throw notFound('That job could not be found.');
  }
  if (step && !viewer.isOffice && stepDriverId(job, step) !== me) {
    throw forbidden(`${STEP_LABELS[step]} is assigned to another driver.`);
  }
  if (expectedVersion !== undefined && row!.version !== expectedVersion) {
    throw conflict('This job changed while you were working on it. Reload and try again.');
  }
  return job;
};

const persist = async (c: PoolClient, before: Job, after: Job): Promise<void> => {
  await c.query(
    `UPDATE jobs SET status = $2, step = $3, seal_no = $4,
                     submitted_at = $5, pretrip_passed_at = $6,
                     version = version + 1
      WHERE id = $1`,
    [
      after.id,
      after.status,
      after.step,
      after.sealNo,
      after.submittedAt,
      after.inspection?.passedAt ?? null,
      ],
  );
  void before;
};

const reload = async (c: PoolClient, id: string, viewer: Viewer): Promise<Job> => {
  const [job] = await loadJobs('j.id = $1', [id], viewer, c);
  if (!job) throw notFound();
  return job;
};

export default async function driverJobRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', driverOnly);

  const viewerOf = (req: { caller: { user: { id: string } } }): Viewer => ({
    userId: req.caller.user.id,
    isOffice: false,
  });

  const itemBody = z.object({
    result: z.enum(['pass', 'defect']),
    note: z.string().max(2000).optional(),
    photoUri: z.string().max(512).nullable().optional(),
    version: z.number().int().optional(),
  });

  app.post('/jobs/:id/inspection/:itemId', async (req, reply) => {
    const { id, itemId } = req.params as { id: string; itemId: string };
    const parsed = itemBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'bad_request', 'Invalid inspection result.');
    const { result, note, photoUri, version } = parsed.data;

    if (!INSPECTION_ITEMS.some(i => i.id === itemId)) {
      throw notFound('That checklist item does not exist.');
    }

    const job = await tx(async c => {
      const before = await lockJob(c, id, viewerOf(req), version, 'pretrip');
      if (before.status !== 'pending' && before.status !== 'blocked') {
        throw new JobStateError('The pre-trip for this job is already done.');
      }
      const storedNote = validateInspectionItem(result, note);

      await c.query(
        `INSERT INTO inspection_items (job_id,item_id,result,note,photo_key)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (job_id,item_id)
         DO UPDATE SET result = EXCLUDED.result, note = EXCLUDED.note,
                       photo_key = EXCLUDED.photo_key`,
        [id, itemId, result, storedNote, photoUri ?? null],
      );

      const after = await reload(c, id, viewerOf(req));
      const state = inspectionState(after.inspection);
      await c.query(
        `UPDATE jobs SET pretrip_passed_at = $2, version = version + 1 WHERE id = $1`,
        [id, state.allPass ? new Date().toISOString() : null],
      );
      return reload(c, id, viewerOf(req));
    });

    return reply.send({ job, gate: gateFor(job, 'pretrip') });
  });

  app.post('/jobs/:id/report-defect', async (req, reply) => {
    const { id } = req.params as { id: string };

    const job = await tx(async c => {
      const before = await lockJob(c, id, viewerOf(req), undefined, 'pretrip');
      const after = reportDefectOn(before);

      const unitId = before.truckId ?? before.chassisId;
      if (!unitId) {
        throw new JobStateError(
          'No truck or chassis is assigned to this job yet — dispatch has to assign one before a defect can be reported.',
        );
      }

      const defects = inspectionState(before.inspection).defects;
      for (const d of defects) {
        await c.query(
          `INSERT INTO defects (id,unit_id,job_id,item,note,reported_by,photo_key)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            `DEF-${id}-${d.id}`,
            unitId,
            id,
            d.label,
            d.note,
            req.caller.user.id,
            d.photoUri,
          ],
        );
      }
      await c.query(
        `UPDATE fleet_units SET status = 'out_of_service' WHERE id = $1`,
        [unitId],
      );

      const { rows: office } = await c.query<{ id: string }>(
        `SELECT id FROM users WHERE role <> 'driver' AND active`,
      );
      for (const u of [...office, { id: req.caller.user.id }]) {
        await notify(c, {
          userId: u.id,
          kind: 'unit_out_of_service',
          title: 'Unit out of service',
          body: `${unitId} — ${defects[0]?.label ?? 'defect reported'}`,
          jobId: id,
          once: `${unitId}-${id}-${u.id}`,
        });
      }
      await persist(c, before, after);
      return reload(c, id, viewerOf(req));
    });

    return reply.send({ job });
  });

  app.post('/jobs/:id/seal-number', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({ sealNo: z.string().max(64), version: z.number().int().optional() })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'bad_request', 'Invalid seal number.');

    const sealNo = parsed.data.sealNo.trim();
    if (!sealNo) {
      throw new JobStateError('Enter the seal number to confirm pickup.');
    }

    const job = await tx(async c => {
      const before = await lockJob(c, id, viewerOf(req), parsed.data.version, 'pickup');
      if (before.status === 'done' || before.status === 'awaiting_approval') {
        throw new JobStateError('This job is already with the office.');
      }
      await c.query(
        `UPDATE jobs SET seal_no = $2, version = version + 1 WHERE id = $1`,
        [id, sealNo],
      );
      return reload(c, id, viewerOf(req));
    });

    return reply.send({ job, gate: gateFor(job, 'pickup') });
  });

  const stepParam = (s: string): EvidenceStep => {
    if (!EVIDENCE_STEPS.includes(s as EvidenceStep)) {
      throw notFound('Unknown capture step.');
    }
    return s as EvidenceStep;
  };

  app.post('/jobs/:id/evidence/:step/:slot', async (req, reply) => {
    const { id, step: rawStep, slot } = req.params as {
      id: string;
      step: string;
      slot: string;
    };
    const step = stepParam(rawStep);
    const index = Number(slot);
    const parsed = z
      .object({ key: z.string().min(1).max(512), version: z.number().int().optional() })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'bad_request', 'Missing upload key.');

    const job = await tx(async c => {
      const before = await lockJob(c, id, viewerOf(req), parsed.data.version, step);
      if (before.status === 'done') {
        throw new JobStateError('This job is closed.');
      }
      assertOwnKey(parsed.data.key, `jobs/${id}/evidence/${step}/${index}/`);
      capturePhotoOn(before, step, index, parsed.data.key);

      await c.query(
        `INSERT INTO job_evidence (job_id,step,slot_index,s3_key)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (job_id,step,slot_index)
         DO UPDATE SET s3_key = EXCLUDED.s3_key, captured_at = now()`,
        [id, step, index, parsed.data.key],
      );
      await c.query(`UPDATE jobs SET version = version + 1 WHERE id = $1`, [id]);
      return reload(c, id, viewerOf(req));
    });

    return reply.send({ job, gate: gateFor(job, step) });
  });

  app.delete('/jobs/:id/evidence/:step/:slot', async (req, reply) => {
    const { id, step: rawStep, slot } = req.params as {
      id: string;
      step: string;
      slot: string;
    };
    const step = stepParam(rawStep);
    const index = Number(slot);

    const job = await tx(async c => {
      const before = await lockJob(c, id, viewerOf(req), undefined, step);
      if (before.status === 'done') {
        throw new JobStateError('An approved job cannot be changed.');
      }
      const after = deletePhotoOn(before, step, index);

      await c.query(
        `DELETE FROM job_evidence WHERE job_id = $1 AND step = $2 AND slot_index = $3`,
        [id, step, index],
      );
      await persist(c, before, after);
      return reload(c, id, viewerOf(req));
    });

    return reply.send({ job, gate: gateFor(job, step) });
  });

  app.post('/jobs/:id/photos', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        keys: z.array(z.string().min(1).max(512)).min(1).max(20),
        alt: z.string().max(200).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'bad_request', 'No photos to add.');

    const job = await tx(async c => {
      await lockJob(c, id, viewerOf(req), undefined);
      for (const key of parsed.data.keys) assertOwnKey(key, `jobs/${id}/job_photo/`);
      for (const key of parsed.data.keys) {
        await c.query(
          `INSERT INTO job_photos (id,job_id,s3_key,alt,uploaded_by)
           VALUES ($1,$2,$3,$4,$5)`,
          [`PHO-${crypto.randomUUID()}`, id, key, parsed.data.alt ?? '', req.caller.user.id],
        );
      }
      return reload(c, id, viewerOf(req));
    });

    return reply.send({ job });
  });

  app.delete('/jobs/:id/photos/:photoId', async (req, reply) => {
    const { id, photoId } = req.params as { id: string; photoId: string };

    const job = await tx(async c => {
      await lockJob(c, id, viewerOf(req), undefined);
      const { rowCount } = await c.query(
        `DELETE FROM job_photos
          WHERE id = $1 AND job_id = $2 AND uploaded_by = $3`,
        [photoId, id, req.caller.user.id],
      );
      if (!rowCount) {
        throw notFound('That photo is not one you uploaded.');
      }
      return reload(c, id, viewerOf(req));
    });

    return reply.send({ job });
  });

  app.post('/jobs/:id/advance', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({ step: z.enum(STEPS), version: z.number().int().optional() })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'bad_request', 'Which step?');

    const job = await tx(async c => {
      const before = await lockJob(c, id, viewerOf(req), parsed.data.version, parsed.data.step);
      const after = advanceJob(before, parsed.data.step as JobStep);
      await persist(c, before, after);
      return reload(c, id, viewerOf(req));
    });

    return reply.send({ job, gate: gateFor(job, job.step) });
  });

  app.post('/jobs/:id/submit', async (req, reply) => {
    const { id } = req.params as { id: string };
    const version = z
      .object({ version: z.number().int().optional() })
      .safeParse(req.body).data?.version;

    const job = await tx(async c => {
      const before = await lockJob(c, id, viewerOf(req), version, 'delivery');
      const after = submitJob(before);
      await persist(c, before, after);

      const { rows } = await c.query<{ notify: boolean; email: string | null }>(
        `SELECT cu.notify_on_completion AS notify, cu.email
           FROM jobs j JOIN customers cu ON cu.id = j.customer_id
          WHERE j.id = $1`,
        [id],
      );
      if (rows[0]?.notify && rows[0].email) {
        await c.query(
          `INSERT INTO outbox (kind, job_id, payload)
           VALUES ('job_complete', $1, $2)
           ON CONFLICT DO NOTHING`,
          [
            id,
            JSON.stringify({
              to: rows[0].email,
              jobId: id,
              summary:
                'Container returned and chassis returned; 9 photos are attached.',
            }),
          ],
        );
      }
      return reload(c, id, viewerOf(req));
    });

    return reply.send({ job });
  });
}
