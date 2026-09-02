/**
 * Admin writes for customers, drivers, fleet and payroll.
 *
 * Every route names the capability it needs; `requires()` reads the same map
 * W13 renders, so there is still one copy of who-can-do-what.
 */
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { JobStateError } from '@a3/domain';
import { q, tx } from '../db.ts';
import { loadCustomer } from '../serialize/customers.ts';
import { loadDriver } from '../serialize/drivers.ts';
import { officeOnly, requires } from '../guard.ts';
import { HttpError, conflict, notFound } from '../errors.ts';
import { revokeAllFor } from '../session.ts';
import { hash, issueReset } from '../password.ts';
import { notify } from '../notify.ts';

const toCents = (d: number) => Math.round(d * 100);

export default async function adminPeopleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', officeOnly);

  // ── customers ─────────────────────────────────────────────────────────────

  const customerInput = z.object({
    name: z.string().trim().min(1).max(200),
    // W16's form does not collect a short name — it is a display abbreviation,
    // not a fact about the customer. Defaulted from the name rather than made
    // required, so the one screen that creates customers can actually do so.
    shortName: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().email().max(320),
    contactName: z.string().trim().max(200).optional().default(''),
    phone: z.string().trim().max(40).optional().default(''),
    notifyOnCompletion: z.boolean().optional(),
  });

  app.post(
    '/customers',
    { preHandler: requires('manageCustomersFleet') },
    async (req, reply) => {
      const parsed = customerInput.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, 'bad_request', 'That customer is not complete.');
      }
      const d = parsed.data;
      const { rows } = await q<{ n: string }>(
        `SELECT to_char(coalesce(max(substring(id from 'CUS-([0-9]+)')::int),0)+1,'FM000') n
           FROM customers`,
      );
      const id = `CUS-${rows[0]!.n}`;
      await q(
        `INSERT INTO customers (id,name,short_name,email,contact_name,phone,
                                notify_on_completion,customer_since)
         VALUES ($1,$2,$3,$4,$5,$6,$7,current_date)`,
        [id, d.name, d.shortName ?? d.name, d.email, d.contactName, d.phone,
         d.notifyOnCompletion ?? true],
      );
      // Re-read through the shared loader rather than echoing the input, so
      // create, read and update cannot describe the same customer differently.
      return reply.code(201).send({ customer: await loadCustomer(id) });
    },
  );

  app.patch(
    '/customers/:id',
    { preHandler: requires('manageCustomersFleet') },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const patch = customerInput.partial().safeParse(req.body);
      if (!patch.success) throw new HttpError(400, 'bad_request', 'Invalid change.');
      const d = patch.data;

      const { rowCount } = await q(
        `UPDATE customers SET
           name = coalesce($2,name), short_name = coalesce($3,short_name),
           email = coalesce($4,email), contact_name = coalesce($5,contact_name),
           phone = coalesce($6,phone),
           notify_on_completion = coalesce($7,notify_on_completion)
         WHERE id = $1`,
        [id, d.name ?? null, d.shortName ?? null, d.email ?? null,
         d.contactName ?? null, d.phone ?? null, d.notifyOnCompletion ?? null],
      );
      if (!rowCount) throw notFound('That customer could not be found.');
      return reply.send({ customer: await loadCustomer(id) });
    },
  );

  // ── drivers ───────────────────────────────────────────────────────────────

  /**
   * W9. Drivers are added by an admin and NEVER self-register — there is no
   * signup endpoint anywhere in this API.
   *
   * The form has no password field, so the account is created with an
   * unguessable random secret and an invite link, reusing the M3 reset
   * mechanism (§9 B2). One code path, no second screen.
   */
  app.post('/drivers', { preHandler: requires('manageDrivers') }, async (req, reply) => {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(200),
        email: z.string().trim().email().max(320),
        phone: z.string().trim().max(40).optional().default(''),
        base: z.string().trim().max(120).optional().default('Houston'),
        /**
         * A password the admin sets and tells the driver directly.
         *
         * ponytail: a stand-in until invite email actually sends. It is a
         * shared secret two people know, which a real invite link is not — so
         * the invite is still issued alongside it and the driver can replace
         * this with one only they know. Drop this field the day mail works.
         *
         * Same 8-character floor as `/auth/change-password`: a temporary
         * password is still the only thing guarding a real account.
         */
        tempPassword: z.string().min(8).max(200).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'bad_request', 'That driver is not complete.', 'email');
    }
    const d = parsed.data;

    const created = await tx(async c => {
      const { rows: dupe } = await c.query(`SELECT 1 FROM users WHERE email = $1`, [d.email]);
      if (dupe[0]) throw conflict('Someone already uses that email address.');

      const { rows } = await c.query<{ n: string }>(
        `SELECT to_char(coalesce(max(substring(id from 'DRV-([0-9]+)')::int),0)+1,'FM000') n
           FROM users WHERE role = 'driver'`,
      );
      const id = `DRV-${rows[0]!.n}`;
      const initials = d.name
        .split(/\s+/)
        .slice(0, 2)
        .map(w => w[0]?.toUpperCase() ?? '')
        .join('');

      await c.query(
        `INSERT INTO users (id,email,password_hash,name,initials,role,phone,base,active)
         VALUES ($1,$2,$3,$4,$5,'driver',$6,$7,true)`,
        // The admin's temporary password when they set one, otherwise
        // unguessable bytes nobody holds — in which case the invite link is
        // the only way in, which is the design once mail sends.
        [id, d.email, await hash(d.tempPassword ?? randomBytes(32).toString('hex')),
         d.name, initials, d.phone, d.base],
      );

      const invite = await issueReset(c, id, '7 days', true);
      req.log.info({ email: d.email, invite }, 'driver invite issued');

      return { id, initials };
    });

    const { tempPassword: _omit, ...safe } = d;
    return reply.code(201).send({
      driver: {
        id: created.id,
        ...safe,
        initials: created.initials,
        active: true,
        // A driver created a moment ago has no history; these are facts, not
        // placeholders, and the table renders them straight.
        joinedAt: new Date().toISOString(),
        lastActiveAt: null,
        jobsCompleted: 0,
        jobsInProgress: 0,
        jobsOverdue: 0,
      },
    });
  });

  /**
   * W8-confirm. Deactivating must log them out NOW — a driver who has been
   * stood down should not keep capturing evidence on a live token. This is the
   * reason sessions are rows and not JWTs.
   */
  app.post(
    '/drivers/:id/deactivate',
    { preHandler: requires('manageDrivers') },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { rowCount } = await q(
        `UPDATE users SET active = false WHERE id = $1 AND role = 'driver'`,
        [id],
      );
      if (!rowCount) throw notFound('That driver could not be found.');
      await revokeAllFor(id);
      return reply.send({ driver: await loadDriver(id) });
    },
  );

  /**
   * W8. Puts a stood-down driver back on the road.
   *
   * No sessions are restored: revoking them was the point of deactivating, and
   * the driver signs in again. Their jobs, evidence and pay lines were never
   * touched — deactivating suspends access, it does not erase history — so
   * there is nothing to put back but the flag.
   */
  app.post(
    '/drivers/:id/activate',
    { preHandler: requires('manageDrivers') },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { rowCount } = await q(
        `UPDATE users SET active = true WHERE id = $1 AND role = 'driver'`,
        [id],
      );
      if (!rowCount) throw notFound('That driver could not be found.');
      return reply.send({ driver: await loadDriver(id) });
    },
  );

  // ── fleet ─────────────────────────────────────────────────────────────────

  /**
   * W17. Create a truck or a chassis.
   *
   * The id is typed by the office, not generated: it is the number painted on
   * the unit, and a driver reading `TRK-118` off a bumper has to find the same
   * string here. That makes it a natural key, so a duplicate is a conflict
   * rather than a second row for the same vehicle.
   */
  app.post(
    '/fleet',
    { preHandler: requires('manageCustomersFleet') },
    async (req, reply) => {
      const parsed = z
        .object({
          id: z.string().trim().min(1).max(32),
          kind: z.enum(['truck', 'chassis']),
          plate: z.string().trim().max(32).optional().default(''),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, 'bad_request', 'That unit is not complete.', 'id');
      }
      const d = parsed.data;
      const id = d.id.toUpperCase();

      const { rows: dupe } = await q(`SELECT 1 FROM fleet_units WHERE id = $1`, [id]);
      if (dupe[0]) throw conflict(`${id} is already on the fleet.`);

      await q(
        `INSERT INTO fleet_units (id,kind,label,plate,status)
         VALUES ($1,$2,$3,$4,'in_service')`,
        [id, d.kind, `${d.kind === 'truck' ? 'Truck' : 'Chassis'} ${id}`, d.plate],
      );
      // No inspection dates: a unit nobody has inspected has not been
      // inspected, and inventing a last-inspected stamp would be a lie the
      // fleet screen renders as fact.
      const { rows } = await q<Record<string, any>>(
        `SELECT * FROM fleet_units WHERE id = $1`,
        [id],
      );
      const u = rows[0]!;
      return reply.code(201).send({
        unit: {
          id: u.id,
          kind: u.kind,
          label: u.label,
          plate: u.plate,
          status: u.status,
          outOfService: false,
          onJobId: null,
          defectId: null,
          lastInspectionAt: null,
          nextDueAt: null,
          inspectionHistory: [],
        },
      });
    },
  );

  /**
   * W18. Clears the out-of-service status. The defect row is NOT deleted — it
   * is the legal record of why the unit was pulled, and it outlives the repair.
   */
  app.post(
    '/fleet/:id/return-to-service',
    { preHandler: requires('manageCustomersFleet') },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { rowCount } = await q(
        `UPDATE fleet_units SET status = 'in_service', last_inspection_at = now()
          WHERE id = $1 AND status = 'out_of_service'`,
        [id],
      );
      if (!rowCount) {
        const { rows } = await q(`SELECT 1 FROM fleet_units WHERE id = $1`, [id]);
        if (!rows[0]) throw notFound('That unit could not be found.');
        throw new JobStateError('That unit is not out of service.');
      }
      const { rows } = await q(`SELECT * FROM fleet_units WHERE id = $1`, [id]);
      return reply.send({ unit: rows[0] });
    },
  );

  // ── payroll ───────────────────────────────────────────────────────────────

  /** W20 — amounts are editable HERE ONLY (web), never on mobile. */
  app.patch(
    '/payroll/periods/:id/line',
    { preHandler: requires('viewPayroll') },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = z
        .object({
          driverId: z.string().min(1).max(64),
          jobId: z.string().min(1).max(64),
          legKind: z.enum(['pickup', 'loading', 'delivery']),
          amount: z.number().nonnegative(),
        })
        .safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'bad_request', 'Invalid amount.');
      const d = parsed.data;

      await tx(async c => {
        const { rows } = await c.query<{ status: string }>(
          `SELECT status FROM pay_periods WHERE id = $1 FOR UPDATE`,
          [id],
        );
        if (!rows[0]) throw notFound('That pay period could not be found.');
        // A paid period is a record of a payment that already happened
        // elsewhere. Editing it would make the ledger disagree with the bank.
        if (rows[0].status === 'paid') {
          throw new JobStateError('This period has already been paid and cannot be edited.');
        }
        const { rowCount } = await c.query(
          `UPDATE pay_lines SET amount_cents = $5
            WHERE period_id = $1 AND job_id = $2 AND leg_kind = $3 AND driver_id = $4`,
          [id, d.jobId, d.legKind, d.driverId, toCents(d.amount)],
        );
        if (!rowCount) throw notFound('That pay line could not be found.');
      });

      return reply.send({ ok: true });
    },
  );

  /**
   * W21. Records that a payment happened ELSEWHERE — a date and a reference
   * number. It moves no money and collects no bank or card details.
   *
   * `markPayrollPaid` is deliberately withheld from Assistant Manager, who may
   * view payroll but never close it out.
   */
  app.post(
    '/payroll/periods/:id/mark-paid',
    { preHandler: requires('markPayrollPaid') },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = z
        .object({
          reference: z.string().trim().min(1).max(120),
          paidAt: z.string().min(1),
          method: z.string().trim().max(60).optional().default('Bank transfer'),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(
          400,
          'bad_request',
          'A payment reference and date are required.',
          'reference',
        );
      }
      const d = parsed.data;

      const period = await tx(async c => {
        const { rows } = await c.query<{ status: string }>(
          `SELECT status FROM pay_periods WHERE id = $1 FOR UPDATE`,
          [id],
        );
        if (!rows[0]) throw notFound('That pay period could not be found.');

        const { rowCount } = await c.query(
          `UPDATE pay_periods SET status='paid', reference=$2, paid_at=$3, method=$4
            WHERE id = $1 AND status <> 'paid'`,
          [id, d.reference, d.paidAt, d.method],
        );
        // Idempotent: a replay changes nothing and does not overwrite the
        // reference of the payment that actually happened.
        if (rowCount === 0 && rows[0].status !== 'paid') {
          throw new JobStateError('That period could not be marked paid.');
        }

        if (rowCount) {
          const { rows: paidDrivers } = await c.query<{ driver_id: string }>(
            `SELECT DISTINCT driver_id FROM pay_lines WHERE period_id = $1`,
            [id],
          );
          for (const p of paidDrivers) {
            await notify(c, {
              userId: p.driver_id,
              kind: 'period_paid',
              title: 'Payment sent',
              body: `Reference ${d.reference}`,
              once: `${id}-${p.driver_id}`,
            });
          }
        }

        const { rows: out } = await c.query(`SELECT * FROM pay_periods WHERE id = $1`, [id]);
        return out[0];
      });

      return reply.send({ period });
    },
  );
}
