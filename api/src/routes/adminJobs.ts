/**
 * The admin write path — `AdminJobsRepo`.
 *
 * Two things here are money-critical and neither is left to application logic
 * alone:
 *
 *  · APPROVE IS IDEMPOTENT. The status change is a conditional UPDATE, so a
 *    replay affects zero rows and the accrual is skipped. The `pay_lines`
 *    primary key (period, job, leg) is the second line of defence.
 *
 *  · A SEND-BACK WARNS. The customer was already told the job was complete —
 *    that email fired on submit, not on approval — so the response carries the
 *    warning W22 renders rather than leaving the office to remember.
 */
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
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
import { loadJobs } from '../serialize/jobs.ts';
import { notify } from '../notify.ts';

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
  startDate: z.string().min(1),
  dueDate: z.string().min(1),
  priority: z.enum(['high', 'medium', 'low']),
  /** Dollars in, cents stored. Never a float anywhere downstream. */
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

/** Surfaces the §6.9 copy — message in the toast, `inline` under the leg rows. */
const asHttp = (e: unknown): never => {
  if (e instanceof LegSplitError) {
    throw new HttpError(422, 'leg_split', e.message, 'legs');
  }
  throw e;
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

/**
 * The period a job's legs accrue into: the one whose week contains the
 * approval date. Created on demand so approving in a fresh week does not fail
 * on a missing row, and `UNIQUE (starts_on, ends_on)` makes the create safe
 * under two concurrent approvals.
 */
const periodFor = async (c: PoolClient, at: Date): Promise<string> => {
  const monday = new Date(at);
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  // Held one week, pays the following Friday.
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

  // ── create ────────────────────────────────────────────────────────────────

  app.post('/jobs', { preHandler: requires('createJobs') }, async (req, reply) => {
    const parsed = draft.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'bad_request', 'That job card is not complete.');
    }
    const d = parsed.data;

    // Legs must total the price BEFORE anything is written.
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
        // Ids follow the design's A3-#### form and never carry a '#'.
        `SELECT to_char(coalesce(max(substring(id from 'A3-([0-9]+)')::int), 0) + 1,
                        'FM0000') AS n FROM jobs`,
      );
      const id = `A3-${seq[0]!.n}`;

      await c.query(
        `INSERT INTO jobs (id,title,customer_id,type,priority,status,step,driver_id,
           pickup_location,delivery_location,address,assigned_at,due_at,timezone,
           container_no,truck_id,chassis_id,price_cents,description)
         VALUES ($1,$2,$3,$4,$5,'pending','pretrip',$6,$7,$8,$9,$10,$11,
                 coalesce($12,'America/Chicago'),$13,$14,$15,$16,$17)`,
        [
          id, d.title, d.customerId, d.type, d.priority, d.driverId ?? null,
          d.pickupLocation, d.deliveryLocation, d.address,
          d.startDate, d.dueDate, d.timezone ?? null,
          d.containerNo || null, d.truckId ?? null, d.chassisId ?? null,
          toCents(d.price), d.description || null,
        ],
      );
      await writeLegs(c, id, d.legs);

      if (d.driverId) {
        await notify(c, {
          userId: d.driverId,
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

  // ── update ────────────────────────────────────────────────────────────────

  app.put('/jobs/:id', { preHandler: requires('updateJobs') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = draft.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'bad_request', 'That job card is not complete.');
    }
    const d = parsed.data;

    const job = await tx(async c => {
      const { rows } = await c.query<{ status: string; version: number }>(
        `SELECT status, version FROM jobs WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const row = rows[0];
      if (!row) throw notFound('That job could not be found.');
      if (d.version !== undefined && row.version !== d.version) {
        throw conflict('This job changed while you were editing it. Reload and try again.');
      }
      // Checked BEFORE the leg split: on a closed job the useful answer is
      // "this is closed", not "your legs are $10 out". Sending someone to fix
      // arithmetic on an edit that can never apply wastes their time.
      if (row.status === 'done') {
        throw new JobStateError('An approved job can no longer be edited.');
      }

      // Legs must total the price before anything is written.
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
                chassis_id=$14, price_cents=$15, description=$16,
                version = version + 1
          WHERE id = $1`,
        [
          id, d.title, d.customerId, d.type, d.priority, d.driverId ?? null,
          d.pickupLocation, d.deliveryLocation, d.address,
          d.startDate, d.dueDate, d.containerNo || null,
          d.truckId ?? null, d.chassisId ?? null, toCents(d.price),
          d.description || null,
        ],
      );
      await writeLegs(c, id, d.legs);

      const [updated] = await loadJobs('j.id = $1', [id], asOffice(req.caller.user.id), c);
      return updated!;
    });

    return reply.send({ job });
  });

  // ── approve ───────────────────────────────────────────────────────────────

  /**
   * The closeout. Moves the job to DONE and accrues its legs to payroll, once.
   *
   * Idempotence is structural, not a flag check: the UPDATE is conditional on
   * the job still being AWAITING APPROVAL, so a replay updates zero rows and
   * returns early before any pay line is written.
   */
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
        // Already approved (replay) — return it unchanged. Anything else has
        // not been submitted yet and cannot be approved.
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
        // ON CONFLICT DO NOTHING against PK (period, job, leg): even if this
        // ran twice, a leg cannot be paid twice.
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

  // ── send back ─────────────────────────────────────────────────────────────

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
        // No `once` key: a job can be sent back more than once, and each is a
        // separate thing the driver has to act on.
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

    // The completion email fired on SUBMIT, not on approval — so by now the
    // customer has already been told the job is done. W22 shows this warning;
    // it is carried here so no caller has to remember it independently.
    return reply.send({
      job: result,
      warning:
        'The customer was already told this job was complete. Let them know it is being redone.',
    });
  });
}
