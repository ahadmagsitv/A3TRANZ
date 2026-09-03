/**
 * Job reads. One route per `JobsRepo` method.
 *
 * A driver sees only their own jobs — enforced in the WHERE clause, not by a
 * filter the client passes. A `driverId` in the query string is honoured for
 * the office and ignored for a driver, so a driver cannot widen their own
 * scope by sending someone else's id.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../guard.ts';
import { notFound } from '../errors.ts';
import { q } from '../db.ts';
import { COMPANY_TZ, whenLabel } from '../labels.ts';
import { type Viewer, loadJobs } from '../serialize/jobs.ts';

const STATUSES = [
  'pending',
  'in_progress',
  'blocked',
  'awaiting_approval',
  'done',
] as const;

const filter = z.object({
  status: z
    .union([z.enum(STATUSES), z.array(z.enum(STATUSES))])
    .optional()
    .transform(s => (s == null ? undefined : Array.isArray(s) ? s : [s])),
  driverId: z.string().max(64).optional(),
  /** Drivers never send this; the office uses it for W3's overdue chip. */
  overdue: z.coerce.boolean().optional(),
});

export const viewerOf = (req: FastifyRequest): Viewer => ({
  userId: req.caller.user.id,
  isOffice: req.caller.user.role !== 'driver',
});

export default async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/jobs', async (req, reply) => {
    const parsed = filter.safeParse(req.query);
    const f = parsed.success ? parsed.data : {};
    const viewer = viewerOf(req);

    const where: string[] = ['true'];
    const params: unknown[] = [];

    if (!viewer.isOffice) {
      // Scope is the caller's identity, never a parameter they control.
      //
      // Owning the job OR any leg of it: legs can go to different drivers
      // (§6.9 — each leg pays its own), so a driver handed only the delivery
      // would otherwise never see the job they are booked on.
      params.push(viewer.userId);
      where.push(
        `(j.driver_id = $${params.length}
          OR EXISTS (SELECT 1 FROM job_legs l
                      WHERE l.job_id = j.id AND l.driver_id = $${params.length}))`,
      );
    } else if (f.driverId) {
      params.push(f.driverId);
      where.push(`j.driver_id = $${params.length}`);
    }

    if (f.status?.length) {
      params.push(f.status);
      where.push(`j.status = ANY($${params.length}::job_status[])`);
    }
    if (f.overdue) {
      // Derived, so it is a predicate — there is no stored flag to read.
      where.push(`j.due_at < now() AND j.status <> 'done'`);
    }

    const jobs = await loadJobs(where.join(' AND '), params, viewer);
    return reply.send({ jobs });
  });

  app.get('/jobs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const viewer = viewerOf(req);

    // Same rule as the list: the job or any leg of it. They must agree, or a
    // driver sees a job in their list and 404s opening it.
    const where = viewer.isOffice
      ? 'j.id = $1'
      : `j.id = $1 AND (j.driver_id = $2
           OR EXISTS (SELECT 1 FROM job_legs l WHERE l.job_id = j.id AND l.driver_id = $2))`;
    const params = viewer.isOffice ? [id] : [id, viewer.userId];

    const [job] = await loadJobs(where, params, viewer);
    // A driver asking for someone else's job gets the same 404 as one that
    // does not exist — a 403 would confirm the job is real.
    if (!job) throw notFound('That job could not be found.');
    return reply.send({ job });
  });

  /** M13 / W5 job notes. */
  app.get('/jobs/:id/notes', async (req, reply) => {
    const { id } = req.params as { id: string };
    const viewer = viewerOf(req);
    const { rows } = await q<Record<string, any>>(
      `SELECT n.*, u.name AS author_name, u.initials
         FROM job_notes n
         JOIN users u ON u.id = n.author_id
         JOIN jobs j ON j.id = n.job_id
        WHERE n.job_id = $1 AND ($2 OR j.driver_id = $3)
        ORDER BY n.created_at`,
      [id, viewer.isOffice, viewer.userId],
    );
    const now = new Date();
    return reply.send({
      notes: rows.map(n => ({
        id: n.id,
        jobId: n.job_id,
        authorId: n.author_id,
        authorName: n.author_name,
        initials: n.initials,
        at: n.created_at.toISOString(),
        whenLabel: whenLabel(n.created_at, now, COMPANY_TZ),
        body: n.body,
      })),
    });
  });
}
