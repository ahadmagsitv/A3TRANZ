import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  JobStateError,
  LegSplitError,
  type LegKind,
  validateLegSplit,
} from '@a3/domain';
import { tx } from '../db.ts';
import { officeOnly, requires } from '../guard.ts';
import { HttpError, conflict, notFound } from '../errors.ts';
import { assertOwnKey } from '../storage.ts';
import { loadJobs } from '../serialize/jobs.ts';
import { announceOwnerChange, notify, notifyPooled } from '../notify.ts';
import { MAX_BYTES } from './uploads.ts';

const LEG_KINDS = ['pickup', 'loading', 'delivery'] as const;

const office = { userId: '', isOffice: true as const };
const asOffice = (userId: string) => ({ userId, isOffice: true as const });

const draft = z.object({
  title: z.string().trim().min(1).max(200),
  type: z.enum(['import', 'export']),
  customerId: z.string().min(1).max(64),
  description: z.string().max(4000).optional().default(''),
  containerNo: z.string().max(64).optional().default(''),
  pickupLocation: z.string().trim().min(1).max(300),
  deliveryLocation: z.string().trim().min(1).max(300),
  address: z.string().max(300).optional().default(''),
  mapQuery: z
    .string()
    .regex(/^-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?$/)
    .nullable()
    .optional()
    .default(null),
  startDate: z.string().min(1),
  dueDate: z.string().min(1),
  priority: z.enum(['high', 'medium', 'low']),
  price: z.number().nonnegative(),
  legs: z
    .array(
      z.object({
        kind: z.enum(LEG_KINDS),
        driverId: z.string().min(1).max(64),
        amount: z.number().nonnegative(),
      }),
    )
    .max(3),
  driverId: z.string().max(64).nullable().optional(),
  truckId: z.string().max(64).nullable().optional(),
  chassisId: z.string().max(64).nullable().optional(),
  timezone: z.string().max(64).optional(),
  notifyCustomer: z.boolean().optional(),
  version: z.number().int().optional(),
});

const toCents = (dollars: number): number => Math.round(dollars * 100);

const asHttp = (e: unknown): never => {
  if (e instanceof LegSplitError) {
    throw new HttpError(422, 'leg_split', e.message, 'legs');
  }
  throw e;
};

const ownerOf = (
  explicit: string | null | undefined,
  legs: { kind: LegKind; driverId: string }[],
): string | null => {
  if (explicit) return explicit;
  const pickup = legs.find(l => l.kind === 'pickup' && l.driverId);
  return (pickup ?? legs.find(l => l.driverId))?.driverId ?? null;
};

const writeLegs = async (
  c: PoolClient,
  jobId: string,
  legs: { kind: LegKind; driverId: string; amount: number }[],
): Promise<void> => {
  await c.query(`DELETE FROM job_legs WHERE job_id = $1`, [jobId]);
  for (const [ordinal, leg] of legs.entries()) {
    await c.query(
      `INSERT INTO job_legs (job_id,kind,driver_id,amount_cents,ordinal)
       VALUES ($1,$2,$3,$4,$5)`,
      [jobId, leg.kind, leg.driverId, toCents(leg.amount), ordinal],
    );
  }
};

const periodFor = async (c: PoolClient, at: Date): Promise<string> => {
  const monday = new Date(at);
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const pays = new Date(monday);
  pays.setUTCDate(monday.getUTCDate() + 18);

  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const label = `${new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(monday)} – ${new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(sunday)}`;

  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO pay_periods (id,label,starts_on,ends_on,status,closes_at,pays_at)
     VALUES ($1,$2,$3,$4,'accruing',$5,$6)
     ON CONFLICT (starts_on, ends_on) DO UPDATE SET label = EXCLUDED.label
     RETURNING id`,
    [
      `PER-${ymd(monday)}`,
      label,
      ymd(monday),
      ymd(sunday),
      `${ymd(sunday)}T23:59:59Z`,
      `${ymd(pays)}T12:00:00Z`,
    ],
  );
  return rows[0]!.id;
};

export default async function adminJobRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', officeOnly);
  void office;

  const placesKey = () => {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) throw new HttpError(501, 'places_disabled', 'Location search is not configured.');
    return key;
  };

  app.get('/places/autocomplete', async (req, reply) => {
    const input = z.string().trim().min(2).max(200).safeParse((req.query as { q?: string }).q);
    if (!input.success) return reply.send({ suggestions: [] });
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': placesKey() },
      body: JSON.stringify({ input: input.data }),
    });
    if (!res.ok) throw new HttpError(502, 'places_failed', 'Location search failed.');
    const body = (await res.json()) as {
      suggestions?: { placePrediction?: { placeId: string; text?: { text: string } } }[];
    };
    return reply.send({
      suggestions: (body.suggestions ?? [])
        .map(s => s.placePrediction)
        .filter(p => p?.placeId)
        .map(p => ({ placeId: p!.placeId, text: p!.text?.text ?? '' })),
    });
  });

  app.get('/places/:placeId', async (req, reply) => {
    const { placeId } = req.params as { placeId: string };
    if (!/^[\w-]{1,300}$/.test(placeId)) throw new HttpError(400, 'bad_request', 'Invalid place.');
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: { 'x-goog-api-key': placesKey(), 'x-goog-fieldmask': 'formattedAddress,location' },
    });
    if (!res.ok) throw new HttpError(502, 'places_failed', 'Could not load that location.');
    const p = (await res.json()) as {
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
    };
    return reply.send({
      address: p.formattedAddress ?? '',
      mapQuery: p.location ? `${p.location.latitude},${p.location.longitude}` : null,
    });
  });

  app.post('/jobs', { preHandler: requires('createJobs') }, async (req, reply) => {
    const parsed = draft.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'bad_request', 'That job card is not complete.');
    }
    const d = parsed.data;

    try {
      validateLegSplit(
        d.legs.map(l => ({ kind: l.kind, amountCents: toCents(l.amount) })),
        toCents(d.price),
      );
    } catch (e) {
      asHttp(e);
    }

    const job = await tx(async c => {
      const { rows: seq } = await c.query<{ n: string }>(
        `SELECT to_char(coalesce(max(substring(id from 'A3-([0-9]+)')::int), 0) + 1,
                        'FM0000') AS n FROM jobs`,
      );
      const id = `A3-${seq[0]!.n}`;
      const owner = ownerOf(d.driverId, d.legs);

      await c.query(
        `INSERT INTO jobs (id,title,customer_id,type,priority,status,step,driver_id,
           pickup_location,delivery_location,address,assigned_at,due_at,timezone,
           container_no,truck_id,chassis_id,price_cents,description,map_query)
         VALUES ($1,$2,$3,$4,$5,'pending','pretrip',$6,$7,$8,$9,$10,$11,
                 coalesce($12,'America/Chicago'),$13,$14,$15,$16,$17,$18)`,
        [
          id, d.title, d.customerId, d.type, d.priority, owner,
          d.pickupLocation, d.deliveryLocation, d.address,
          d.startDate, d.dueDate, d.timezone ?? null,
          d.containerNo || null, d.truckId ?? null, d.chassisId ?? null,
          toCents(d.price), d.description || null, d.mapQuery,
        ],
      );
      await writeLegs(c, id, d.legs);

      if (owner) {
        await notify(c, {
          userId: owner,
          kind: 'job_assigned',
          title: 'New job assigned',
          body: `${id} · ${d.title}`,
          jobId: id,
          once: id,
        });
      }

      const [created] = await loadJobs('j.id = $1', [id], asOffice(req.caller.user.id), c);
      return created!;
    });

    return reply.code(201).send({ job });
  });

  app.put('/jobs/:id', { preHandler: requires('updateJobs') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = draft.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'bad_request', 'That job card is not complete.');
    }
    const d = parsed.data;

    const { job, previousDriverId } = await tx(async c => {
      const { rows } = await c.query<{
        status: string;
        version: number;
        driver_id: string | null;
      }>(
        `SELECT status, version, driver_id FROM jobs WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const row = rows[0];
      if (!row) throw notFound('That job could not be found.');
      if (d.version !== undefined && row.version !== d.version) {
        throw conflict('This job changed while you were editing it. Reload and try again.');
      }
      if (row.status === 'done') {
        throw new JobStateError('An approved job can no longer be edited.');
      }

      try {
        validateLegSplit(
          d.legs.map(l => ({ kind: l.kind, amountCents: toCents(l.amount) })),
          toCents(d.price),
        );
      } catch (e) {
        asHttp(e);
      }

      await c.query(
        `UPDATE jobs SET title=$2, customer_id=$3, type=$4, priority=$5, driver_id=$6,
                pickup_location=$7, delivery_location=$8, address=$9,
                assigned_at=$10, due_at=$11, container_no=$12, truck_id=$13,
                chassis_id=$14, price_cents=$15, description=$16, map_query=$17,
                version = version + 1
          WHERE id = $1`,
        [
          id, d.title, d.customerId, d.type, d.priority, ownerOf(d.driverId, d.legs),
          d.pickupLocation, d.deliveryLocation, d.address,
          d.startDate, d.dueDate, d.containerNo || null,
          d.truckId ?? null, d.chassisId ?? null, toCents(d.price),
          d.description || null, d.mapQuery,
        ],
      );
      await writeLegs(c, id, d.legs);

      const [updated] = await loadJobs('j.id = $1', [id], asOffice(req.caller.user.id), c);
      return { job: updated!, previousDriverId: row.driver_id };
    });

    const owner = ownerOf(d.driverId, d.legs);
    await announceOwnerChange(id, d.title, previousDriverId, owner);
    if (owner && owner === previousDriverId) {
      await notifyPooled({
        userId: owner,
        kind: 'job_updated',
        title: 'Job updated',
        body: `${id} · ${d.title}`,
        jobId: id,
      });
    }

    return reply.send({ job });
  });

  app.post('/jobs/:id/attachments', { preHandler: requires('updateJobs') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        files: z
          .array(
            z.object({
              key: z.string().min(1).max(512),
              name: z.string().trim().min(1).max(200),
              sizeBytes: z.number().int().nonnegative().max(MAX_BYTES),
              kind: z.enum(['document', 'photo']),
            }),
          )
          .min(1)
          .max(20),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'bad_request', 'No files to attach.');

    let jobDriverId: string | null = null;
    let jobTitle = '';

    const job = await tx(async c => {
      const { rows } = await c.query<{ driver_id: string | null; title: string }>(
        `SELECT driver_id, title FROM jobs WHERE id = $1`,
        [id],
      );
      if (!rows[0]) throw notFound('That job could not be found.');
      jobDriverId = rows[0].driver_id;
      jobTitle = rows[0].title;

      for (const f of parsed.data.files) {
        assertOwnKey(f.key, `jobs/${id}/attachment/`);
        await c.query(
          `INSERT INTO job_attachments (id,job_id,name,size_bytes,s3_key,origin,kind)
           VALUES ($1,$2,$3,$4,$5,'admin',$6)`,
          [`ATT-${randomUUID()}`, id, f.name, f.sizeBytes, f.key, f.kind],
        );
      }
      const [updated] = await loadJobs('j.id = $1', [id], asOffice(req.caller.user.id), c);
      return updated;
    });

    if (jobDriverId) {
      const n = parsed.data.files.length;
      await notifyPooled({
        userId: jobDriverId,
        kind: 'job_updated',
        title: n === 1 ? 'Document added' : `${n} documents added`,
        body: `${id} · ${jobTitle}`,
        jobId: id,
      });
    }

    return reply.send({ job });
  });

  app.delete(
    '/jobs/:id/attachments/:attachmentId',
    { preHandler: requires('updateJobs') },
    async (req, reply) => {
      const { id, attachmentId } = req.params as { id: string; attachmentId: string };
      const job = await tx(async c => {
        const { rowCount } = await c.query(
          `DELETE FROM job_attachments WHERE id = $1 AND job_id = $2 AND origin = 'admin'`,
          [attachmentId, id],
        );
        if (!rowCount) throw notFound('That attachment could not be found.');
        const [updated] = await loadJobs('j.id = $1', [id], asOffice(req.caller.user.id), c);
        return updated;
      });
      return reply.send({ job });
    },
  );

  app.post('/jobs/:id/assign', { preHandler: requires('updateJobs') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({ driverId: z.string().min(1).max(64).nullable() })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'bad_request', 'Pick a driver.', 'driverId');

    const { job, previousDriverId } = await tx(async c => {
      const { rows } = await c.query<{ status: string; driver_id: string | null }>(
        `SELECT status, driver_id FROM jobs WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (!rows[0]) throw notFound('That job could not be found.');
      if (rows[0].status === 'done') {
        throw new JobStateError('An approved job can no longer be reassigned.');
      }

      if (parsed.data.driverId) {
        const { rows: d } = await c.query<{ active: boolean }>(
          `SELECT active FROM users WHERE id = $1 AND role = 'driver'`,
          [parsed.data.driverId],
        );
        if (!d[0]) throw notFound('That driver could not be found.');
        if (!d[0].active) {
          throw new JobStateError('That driver is not active. Reactivate them first.');
        }
      }

      await c.query(
        `UPDATE jobs SET driver_id = $2, version = version + 1 WHERE id = $1`,
        [id, parsed.data.driverId],
      );

      if (parsed.data.driverId) {
        await c.query(`UPDATE job_legs SET driver_id = $2 WHERE job_id = $1`, [
          id,
          parsed.data.driverId,
        ]);
      }
      const [updated] = await loadJobs('j.id = $1', [id], asOffice(req.caller.user.id), c);
      return { job: updated, previousDriverId: rows[0]!.driver_id };
    });

    await announceOwnerChange(id, job!.title, previousDriverId, parsed.data.driverId);

    return reply.send({ job });
  });

  app.post('/jobs/:id/approve', { preHandler: requires('approveJobs') }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const result = await tx(async c => {
      const { rows: current } = await c.query<{ status: string }>(
        `SELECT status FROM jobs WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (!current[0]) throw notFound('That job could not be found.');

      const { rowCount } = await c.query(
        `UPDATE jobs SET status = 'done', approved_at = now(), version = version + 1
          WHERE id = $1 AND status = 'awaiting_approval'`,
        [id],
      );

      if (rowCount === 0) {
        if (current[0].status !== 'done') {
          throw new JobStateError(
            'This job has not been submitted for approval yet.',
          );
        }
        const [already] = await loadJobs('j.id = $1', [id], asOffice(req.caller.user.id), c);
        return { job: already!, accrued: 0 };
      }

      const periodId = await periodFor(c, new Date());
      const { rows: legs } = await c.query<{
        kind: LegKind;
        driver_id: string | null;
        amount_cents: number;
      }>(`SELECT kind, driver_id, amount_cents FROM job_legs WHERE job_id = $1`, [id]);

      let accrued = 0;
      for (const leg of legs) {
        if (!leg.driver_id) continue;
        const { rowCount: n } = await c.query(
          `INSERT INTO pay_lines (period_id,job_id,leg_kind,driver_id,amount_cents)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [periodId, id, leg.kind, leg.driver_id, leg.amount_cents],
        );
        accrued += n ?? 0;
      }

      const { rows: job } = await c.query<{ driver_id: string | null; title: string }>(
        `SELECT driver_id, title FROM jobs WHERE id = $1`,
        [id],
      );
      if (job[0]?.driver_id) {
        await notify(c, {
          userId: job[0].driver_id,
          kind: 'approved',
          title: 'Job approved',
          body: `${id} · ${job[0].title}`,
          jobId: id,
          once: id,
        });
      }

      const [approved] = await loadJobs('j.id = $1', [id], asOffice(req.caller.user.id), c);
      return { job: approved!, accrued };
    });

    return reply.send(result);
  });

  app.post('/jobs/:id/send-back', { preHandler: requires('approveJobs') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({ reason: z.string().trim().min(1).max(2000) })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        'bad_request',
        'Say what needs redoing before sending the job back.',
        'reason',
      );
    }

    const result = await tx(async c => {
      const { rows } = await c.query<{ status: string; driver_id: string | null }>(
        `SELECT status, driver_id FROM jobs WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const row = rows[0];
      if (!row) throw notFound('That job could not be found.');
      if (row.status !== 'awaiting_approval') {
        throw new JobStateError('Only a job awaiting approval can be sent back.');
      }

      await c.query(
        `UPDATE jobs SET status = 'in_progress', step = 'delivery',
                submitted_at = NULL, version = version + 1
          WHERE id = $1`,
        [id],
      );
      await c.query(
        `INSERT INTO job_notes (id,job_id,author_id,body) VALUES ($1,$2,$3,$4)`,
        [`NTE-${id}-${Date.now()}`, id, req.caller.user.id, parsed.data.reason],
      );
      if (row.driver_id) {
        await notify(c, {
          userId: row.driver_id,
          kind: 'job_updated',
          title: 'Job sent back',
          body: parsed.data.reason,
          jobId: id,
        });
      }

      const [sent] = await loadJobs('j.id = $1', [id], asOffice(req.caller.user.id), c);
      return sent!;
    });

    return reply.send({
      job: result,
      warning:
        'The customer was already told this job was complete. Let them know it is being redone.',
    });
  });
}
