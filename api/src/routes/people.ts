/**
 * Drivers, customers and fleet reads. Small domains, one file.
 */
import type { FastifyInstance } from 'fastify';
import type { Driver, DriverOverview, Unit } from '@a3/domain';
import { q } from '../db.ts';
import { DRIVER_COUNTS, loadDriver, loadDrivers } from '../serialize/drivers.ts';
import { loadCustomer, loadCustomers } from '../serialize/customers.ts';
import { authenticate, officeOnly } from '../guard.ts';
import { notFound } from '../errors.ts';
import { COMPANY_TZ, dateLabel, greeting } from '../labels.ts';

/**
 * The per-driver job counters W7 and M18 both want. Computed in one pass over
 * `jobs` rather than three counting queries, and `overdue` is a predicate here
 * because it is derived — there is no column to read.
 */
export default async function peopleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // ── drivers ───────────────────────────────────────────────────────────────

  /** M15 Profile — the signed-in driver. */
  app.get('/drivers/me', async (req, reply) => {
    const driver = await loadDriver(req.caller.user.id);
    if (!driver) throw notFound();
    return reply.send({ driver });
  });

  /** M18 Home — greeting, badge and the four `.stat` counts, in one read. */
  app.get('/drivers/me/overview', async (req, reply) => {
    const id = req.caller.user.id;
    const now = new Date();

    const [{ rows: counts }, { rows: unread }, { rows: upNext }] = await Promise.all([
      q<Record<string, any>>(
        `SELECT c.* FROM users u ${DRIVER_COUNTS} WHERE u.id = $1`,
        [id],
      ),
      q<{ n: string }>(
        `SELECT count(*)::text n FROM notifications
          WHERE user_id = $1 AND read_at IS NULL`,
        [id],
      ),
      q<{ id: string }>(
        // "Up next" is the soonest job that is not finished and not blocked.
        `SELECT id FROM jobs
          WHERE driver_id = $1 AND status IN ('pending','in_progress')
          ORDER BY due_at ASC LIMIT 1`,
        [id],
      ),
    ]);

    const c = counts[0] ?? {};
    const overview: DriverOverview = {
      dateLabel: dateLabel(now, COMPANY_TZ),
      greeting: greeting(req.caller.user.name, now, COMPANY_TZ),
      unreadNotifications: Number(unread[0]?.n ?? 0),
      upNextJobId: upNext[0]?.id ?? null,
      pending: Number(c.pending ?? 0),
      inProgress: Number(c.in_progress ?? 0),
      doneThisWeek: Number(c.done_week ?? 0),
      overdue: Number(c.overdue ?? 0),
    };
    return reply.send({ overview });
  });

  app.get('/drivers', { preHandler: officeOnly }, async (_req, reply) =>
    reply.send({ drivers: await loadDrivers() }),
  );

  app.get('/drivers/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    // A driver may read their own record; anything else is office-only.
    if (req.caller.user.role === 'driver' && id !== req.caller.user.id) {
      throw notFound();
    }
    const driver = await loadDriver(id);
    if (!driver) throw notFound('That driver could not be found.');
    return reply.send({ driver });
  });

  // ── customers ─────────────────────────────────────────────────────────────

  // Office-only, all five. The customer directory is names, emails and phone
  // numbers, and the fleet list is every unit's status — a driver needs
  // neither: their job payload already carries the customer name and the unit
  // chips. Mobile never calls customersRepo or fleetRepo, so scoping these to
  // the office costs the driver app nothing and stops a driver token from
  // pulling the whole contact list.
  app.get('/customers', { preHandler: officeOnly }, async (_req, reply) => {
    return reply.send({ customers: await loadCustomers() });
  });

  app.get('/customers/:id', { preHandler: officeOnly }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const customer = await loadCustomer(id);
    if (!customer) throw notFound('That customer could not be found.');
    return reply.send({ customer });
  });

  // ── fleet ─────────────────────────────────────────────────────────────────

  const toUnit = (r: Record<string, any>): Unit => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    plate: r.plate,
    status: r.status,
    // Derived, so the two can never disagree.
    outOfService: r.status === 'out_of_service',
    onJobId: r.on_job_id,
    defectId: r.defect_id ?? null,
    lastInspectionAt: r.last_inspection_at ? r.last_inspection_at.toISOString() : null,
    nextDueAt: r.next_due_at ? r.next_due_at.toISOString() : null,
    inspectionHistory: [],
  });

  const UNIT_DEFECT = `
    LEFT JOIN LATERAL (
      SELECT d.id AS defect_id FROM defects d
       WHERE d.unit_id = f.id ORDER BY d.reported_at DESC LIMIT 1
    ) d ON true`;

  app.get('/fleet', { preHandler: officeOnly }, async (_req, reply) => {
    const { rows } = await q<Record<string, any>>(
      `SELECT f.*, d.defect_id FROM fleet_units f ${UNIT_DEFECT} ORDER BY f.kind, f.id`,
    );
    return reply.send({ units: rows.map(toUnit) });
  });

  app.get('/fleet/:id', { preHandler: officeOnly }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await q<Record<string, any>>(
      `SELECT f.*, d.defect_id FROM fleet_units f ${UNIT_DEFECT} WHERE f.id = $1`,
      [id],
    );
    if (!rows[0]) throw notFound('That unit could not be found.');
    return reply.send({ unit: toUnit(rows[0]) });
  });

  /**
   * W18 quotes this and attributes it. It is the legal record of why a unit
   * went out of service, so it is read verbatim and never rewritten.
   */
  app.get('/fleet/:id/defect', { preHandler: officeOnly }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await q<Record<string, any>>(
      `SELECT d.*, u.name AS reporter FROM defects d
         JOIN users u ON u.id = d.reported_by
        WHERE d.unit_id = $1 ORDER BY d.reported_at DESC LIMIT 1`,
      [id],
    );
    const d = rows[0];
    return reply.send({
      defect: d
        ? {
            id: d.id,
            unitId: d.unit_id,
            jobId: d.job_id,
            item: d.item,
            note: d.note,
            reportedBy: d.reporter,
            reportedAt: d.reported_at.toISOString(),
            photoUri: d.photo_key,
          }
        : null,
    });
  });
}
