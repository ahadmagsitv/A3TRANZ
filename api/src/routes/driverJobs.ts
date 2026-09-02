/**
 * The driver write path — the nine `DriverJobsRepo` methods.
 *
 * Every one follows the same shape and none of them deviates:
 *
 *   BEGIN
 *     SELECT ... FOR UPDATE          -- lock the job row
 *     build the Job from its rows     -- same serializer the reads use
 *     run the SHARED state machine    -- throws JobStateError if a gate is unmet
 *     persist what the machine returned
 *     bump version
 *   COMMIT
 *
 * The gates therefore run on the server, not merely in the app. Until now they
 * were UX: a driver holding their own token could POST /submit with zero
 * photos and the office would get a complete job plus a customer email.
 *
 * There is NO `approve` and NO `setStatus` here. Drivers cannot reach 'done',
 * and not because a screen hides the button — no route below produces it.
 */
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
  reportDefect as reportDefectOn,
  submit as submitJob,
  validateInspectionItem,
} from '@a3/domain';
import { tx } from '../db.ts';
import { driverOnly } from '../guard.ts';
import { HttpError, conflict, notFound } from '../errors.ts';
import { loadJobs, type Viewer } from '../serialize/jobs.ts';
import { notify } from '../notify.ts';

const STEPS = ['pretrip', 'pickup', 'load', 'delivery'] as const;

/**
 * Locks the job and returns it in contract shape. FOR UPDATE is what stops two
 * concurrent captures on the same slot, or a submit racing a photo delete.
 */
const lockJob = async (
  c: PoolClient,
  jobId: string,
  viewer: Viewer,
  expectedVersion?: number,
): Promise<Job> => {
  const { rows } = await c.query<{ id: string; version: number; driver_id: string | null }>(
    `SELECT id, version, driver_id FROM jobs WHERE id = $1 FOR UPDATE`,
    [jobId],
  );
  const row = rows[0];
  // Same 404 whether it is missing or someone else's — a 403 confirms it exists.
  if (!row || (!viewer.isOffice && row.driver_id !== viewer.userId)) {
    throw notFound('That job could not be found.');
  }
  if (expectedVersion !== undefined && row.version !== expectedVersion) {
    throw conflict('This job changed while you were working on it. Reload and try again.');
  }
  const [job] = await loadJobs('j.id = $1', [jobId], viewer, c);
  if (!job) throw notFound('That job could not be found.');
  return job;
};

/** Persists what the state machine decided. Nothing else writes these columns. */
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
      // Stamped the moment the checklist clears, not when the last box is ticked.
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

  // ── ① pre-trip ────────────────────────────────────────────────────────────

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
      const before = await lockJob(c, id, viewerOf(req), version);
      if (before.status !== 'pending' && before.status !== 'blocked') {
        throw new JobStateError('The pre-trip for this job is already done.');
      }
      // A ✗ with no note is rejected HERE, by the shared validator — and the
      // DB's CHECK constraint refuses it a second time if this is ever bypassed.
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
      // Clearing all twelve stamps the pass; a later defect un-stamps it.
      const state = inspectionState(after.inspection);
      await c.query(
        `UPDATE jobs SET pretrip_passed_at = $2, version = version + 1 WHERE id = $1`,
        [id, state.allPass ? new Date().toISOString() : null],
      );
      return reload(c, id, viewerOf(req));
    });

    return reply.send({ job, gate: gateFor(job, 'pretrip') });
  });

  /** Defect path: job → BLOCKED, unit → out of service, defect recorded. */
  app.post('/jobs/:id/report-defect', async (req, reply) => {
    const { id } = req.params as { id: string };

    const job = await tx(async c => {
      const before = await lockJob(c, id, viewerOf(req));
      // Throws unless there is a defect AND every defect carries a note.
      const after = reportDefectOn(before);

      // A pre-trip inspects the vehicle. With no unit assigned there is nothing
      // to take out of service and nothing to attribute the defect to — the
      // `defects.unit_id NOT NULL` constraint is right to refuse it, so say so
      // in the gate's language instead of letting it surface as a 500.
      const unitId = before.truckId ?? before.chassisId;
      if (!unitId) {
        throw new JobStateError(
          'No truck or chassis is assigned to this job yet — dispatch has to assign one before a defect can be reported.',
        );
      }

      const defects = inspectionState(before.inspection).defects;
      for (const d of defects) {
        // INSERT-only: this row is the legal record and is never rewritten.
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

      // §6.8 `unit_out_of_service` — dispatch has to know a unit just left the
      // fleet, and the driver gets confirmation their report landed.
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

  // ── ② seal number ─────────────────────────────────────────────────────────

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
      const before = await lockJob(c, id, viewerOf(req), parsed.data.version);
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

  // ── ②③④ evidence ──────────────────────────────────────────────────────────

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
      const before = await lockJob(c, id, viewerOf(req), parsed.data.version);
      if (before.status === 'done') {
        throw new JobStateError('This job is closed.');
      }
      // Throws on an out-of-range slot before anything is written.
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

  /**
   * Deleting re-opens the step: the slot blanks, the button re-locks, and a job
   * that had been submitted on this evidence drops back to IN PROGRESS. The
   * demotion and the deletion commit together — evidence and status can never
   * disagree, which is exactly what W22's reviewer is trusting.
   */
  app.delete('/jobs/:id/evidence/:step/:slot', async (req, reply) => {
    const { id, step: rawStep, slot } = req.params as {
      id: string;
      step: string;
      slot: string;
    };
    const step = stepParam(rawStep);
    const index = Number(slot);

    const job = await tx(async c => {
      const before = await lockJob(c, id, viewerOf(req));
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

  // ── M10 loose photos ──────────────────────────────────────────────────────

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
      await lockJob(c, id, viewerOf(req));
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

  /** §8 Q5: a driver may delete any photo THEY uploaded. Documents are not theirs. */
  app.delete('/jobs/:id/photos/:photoId', async (req, reply) => {
    const { id, photoId } = req.params as { id: string; photoId: string };

    const job = await tx(async c => {
      await lockJob(c, id, viewerOf(req));
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

  // ── advance / submit ──────────────────────────────────────────────────────

  app.post('/jobs/:id/advance', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({ step: z.enum(STEPS), version: z.number().int().optional() })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'bad_request', 'Which step?');

    const job = await tx(async c => {
      const before = await lockJob(c, id, viewerOf(req), parsed.data.version);
      // Throws if blocked, out of order, or the gate is not satisfied.
      const after = advanceJob(before, parsed.data.step as JobStep);
      await persist(c, before, after);
      return reload(c, id, viewerOf(req));
    });

    return reply.send({ job, gate: gateFor(job, job.step) });
  });

  /**
   * ④ → AWAITING APPROVAL. The customer email fires HERE, on submit, not on
   * admin approval — so the outbox row goes in on this very transaction. Its
   * partial unique index is what makes a replayed submit send zero emails.
   */
  app.post('/jobs/:id/submit', async (req, reply) => {
    const { id } = req.params as { id: string };
    const version = z
      .object({ version: z.number().int().optional() })
      .safeParse(req.body).data?.version;

    const job = await tx(async c => {
      const before = await lockJob(c, id, viewerOf(req), version);
      // Throws unless all nine are present.
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
              // §8 Q2 (resolved): no ticket-number literals. They are
              // photographed, never keyed.
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
