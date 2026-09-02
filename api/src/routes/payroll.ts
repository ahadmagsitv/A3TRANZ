/**
 * Payroll reads. One table, two views (contracts/payroll.ts §R-P1):
 *   · W19/W20 read the company-wide period with per-driver groups.
 *   · M24/M25 read one driver's projection of the same rows.
 *
 * Both sum the same `pay_lines`, so the office total and the driver total
 * cannot disagree — there is no second place for either number to live.
 */
import type { FastifyInstance } from 'fastify';
import type {
  DriverPayPeriod,
  EarningsSummary,
  PayGroup,
  PayLine,
  PayPeriod,
} from '@a3/domain';
import { q } from '../db.ts';
import { authenticate, requires } from '../guard.ts';
import { forbidden, notFound } from '../errors.ts';
import { COMPANY_TZ, payDayLabel, rangeLabel } from '../labels.ts';

const dollars = (cents: number | string | null): number =>
  cents == null ? 0 : Number(cents) / 100;

/** M25 itemises this many legs, then renders '+ N more legs'. */
const ITEMISED = 6;

const HOLD_RULE =
  'A week closes on Sunday, is held one week, then pays the following Friday.';

const lineRows = async (periodIds: string[], driverId?: string) => {
  const { rows } = await q<Record<string, any>>(
    `SELECT pl.*, j.title AS job_title, u.name AS driver_name
       FROM pay_lines pl
       JOIN jobs  j ON j.id = pl.job_id
       JOIN users u ON u.id = pl.driver_id
      WHERE pl.period_id = ANY($1)
        AND ($2::text IS NULL OR pl.driver_id = $2)
      ORDER BY pl.driver_id, pl.job_id, pl.leg_kind`,
    [periodIds, driverId ?? null],
  );
  return rows;
};

const toLine = (r: Record<string, any>): PayLine => ({
  jobId: r.job_id,
  jobTitle: r.job_title,
  legLabel:
    r.leg_kind === 'loading' ? 'Loading' : r.leg_kind === 'pickup' ? 'Pickup' : 'Delivery',
  amount: dollars(r.amount_cents),
});

export default async function payrollRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // ── office: company-wide ───────────────────────────────────────────────────

  const buildPeriod = (p: Record<string, any>, lines: Record<string, any>[]): PayPeriod => {
    const byDriver = new Map<string, Record<string, any>[]>();
    for (const l of lines) {
      const bucket = byDriver.get(l.driver_id);
      if (bucket) bucket.push(l);
      else byDriver.set(l.driver_id, [l]);
    }

    const groups: PayGroup[] = [...byDriver.entries()].map(([driverId, rows]) => {
      const itemised = rows.slice(0, ITEMISED);
      const rest = rows.slice(ITEMISED);
      return {
        driverId,
        driverName: rows[0]?.driver_name ?? driverId,
        amount: rows.reduce((n, r) => n + dollars(r.amount_cents), 0),
        legCount: rows.length,
        lines: itemised.map(toLine),
        moreLegsCount: rest.length,
        moreLegsAmount: rest.reduce((n, r) => n + dollars(r.amount_cents), 0),
      };
    });

    return {
      id: p.id,
      label: p.label ?? rangeLabel(p.starts_on, p.ends_on, COMPANY_TZ),
      isCurrent: p.status === 'accruing',
      status: p.status,
      closesAt: p.closes_at.toISOString(),
      paysAt: p.pays_at.toISOString(),
      driverCount: groups.length,
      legCount: lines.length,
      amount: groups.reduce((n, g) => n + g.amount, 0),
      reference: p.reference,
      paidAt: p.paid_at ? p.paid_at.toISOString() : null,
      method: p.method,
      groups,
    };
  };

  // `viewPayroll`, not merely officeOnly: TIER3 (project manager, dispatcher)
  // is office staff without payroll access, and admin-web already hides these
  // screens from them. Enforcing it only in the client left the numbers one
  // curl away.
  app.get('/payroll/periods', { preHandler: requires('viewPayroll') }, async (_req, reply) => {
    const { rows: periods } = await q<Record<string, any>>(
      `SELECT * FROM pay_periods ORDER BY starts_on DESC`,
    );
    const lines = await lineRows(periods.map(p => p.id));
    const byPeriod = new Map<string, Record<string, any>[]>();
    for (const l of lines) {
      const bucket = byPeriod.get(l.period_id);
      if (bucket) bucket.push(l);
      else byPeriod.set(l.period_id, [l]);
    }
    return reply.send({
      periods: periods.map(p => buildPeriod(p, byPeriod.get(p.id) ?? [])),
    });
  });

  app.get('/payroll/periods/:id', { preHandler: requires('viewPayroll') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await q<Record<string, any>>(
      `SELECT * FROM pay_periods WHERE id = $1`,
      [id],
    );
    if (!rows[0]) throw notFound('That pay period could not be found.');
    return reply.send({ period: buildPeriod(rows[0], await lineRows([id])) });
  });

  // ── driver: one driver's projection ───────────────────────────────────────

  /** A driver may only ever read their own earnings. */
  const scopeDriver = (req: { caller: { user: { id: string; role: string } } }, asked?: string) => {
    if (req.caller.user.role === 'driver') {
      if (asked && asked !== req.caller.user.id) throw forbidden();
      return req.caller.user.id;
    }
    if (!asked) throw notFound('Which driver?');
    return asked;
  };

  const buildDriverPeriod = (
    p: Record<string, any>,
    rows: Record<string, any>[],
    driverId: string,
  ): DriverPayPeriod => {
    const itemised = rows.slice(0, ITEMISED);
    const rest = rows.slice(ITEMISED);
    const total = rows.reduce((n, r) => n + dollars(r.amount_cents), 0);
    return {
      id: p.id,
      driverId,
      label: p.label ?? rangeLabel(p.starts_on, p.ends_on, COMPANY_TZ),
      subLabel:
        p.status === 'accruing'
          ? `This week · closes Sunday · ${rows.length} legs`
          : `${rows.length} legs`,
      status: p.status,
      legCount: rows.length,
      total,
      paysOnLabel:
        p.status === 'paid'
          ? null
          : `Held one week · pays ${payDayLabel(p.pays_at, COMPANY_TZ)}`,
      paidOnLabel: p.paid_at ? payDayLabel(p.paid_at, COMPANY_TZ) : null,
      reference: p.reference,
      method: p.method,
      lines: itemised.map(toLine),
      remainingLegCount: rest.length,
      remainingTotal: rest.reduce((n, r) => n + dollars(r.amount_cents), 0),
    };
  };

  app.get('/earnings/periods', async (req, reply) => {
    const { driverId: asked, status } = req.query as {
      driverId?: string;
      status?: 'pending' | 'paid';
    };
    const driverId = scopeDriver(req, asked);

    // 'pending' is accruing + held + payable — everything not yet paid.
    const filter =
      status === 'paid'
        ? `AND p.status = 'paid'`
        : status === 'pending'
          ? `AND p.status <> 'paid'`
          : '';

    const { rows: periods } = await q<Record<string, any>>(
      `SELECT DISTINCT p.* FROM pay_periods p
         JOIN pay_lines pl ON pl.period_id = p.id AND pl.driver_id = $1
        WHERE true ${filter}
        ORDER BY p.starts_on DESC`,
      [driverId],
    );
    const lines = await lineRows(periods.map(p => p.id), driverId);
    const byPeriod = new Map<string, Record<string, any>[]>();
    for (const l of lines) {
      const bucket = byPeriod.get(l.period_id);
      if (bucket) bucket.push(l);
      else byPeriod.set(l.period_id, [l]);
    }
    return reply.send({
      periods: periods.map(p => buildDriverPeriod(p, byPeriod.get(p.id) ?? [], driverId)),
    });
  });

  app.get('/earnings/periods/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const driverId = scopeDriver(req, (req.query as { driverId?: string }).driverId);
    const { rows } = await q<Record<string, any>>(
      `SELECT * FROM pay_periods WHERE id = $1`,
      [id],
    );
    if (!rows[0]) throw notFound('That statement could not be found.');
    const lines = await lineRows([id], driverId);
    if (lines.length === 0) throw notFound('That statement could not be found.');
    return reply.send({ period: buildDriverPeriod(rows[0], lines, driverId) });
  });

  /** M24's two tabs and M18's earnings card, in one read. */
  app.get('/earnings/summary', async (req, reply) => {
    const driverId = scopeDriver(req, (req.query as { driverId?: string }).driverId);

    const { rows } = await q<Record<string, any>>(
      `SELECT p.id, p.status, p.starts_on, p.ends_on, p.pays_at, p.paid_at,
              p.reference, p.label,
              count(pl.*)                     AS legs,
              coalesce(sum(pl.amount_cents),0) AS cents
         FROM pay_periods p
         JOIN pay_lines pl ON pl.period_id = p.id AND pl.driver_id = $1
        GROUP BY p.id
        ORDER BY p.starts_on DESC`,
      [driverId],
    );

    const pending = rows.filter(r => r.status !== 'paid');
    const paid = rows.filter(r => r.status === 'paid');
    const current = rows.find(r => r.status === 'accruing');
    const nextToPay = [...pending].sort(
      (a, b) => a.pays_at.getTime() - b.pays_at.getTime(),
    )[0];
    const lastPaid = paid[0];

    const summary: EarningsSummary = {
      driverId,
      pendingPeriodCount: pending.length,
      pendingLegCount: pending.reduce((n, r) => n + Number(r.legs), 0),
      pendingTotal: pending.reduce((n, r) => n + dollars(r.cents), 0),
      nextPaymentLabel: nextToPay ? payDayLabel(nextToPay.pays_at, COMPANY_TZ) : '—',
      paidPeriodCount: paid.length,
      paidTotal: paid.reduce((n, r) => n + dollars(r.cents), 0),
      lastPaymentLabel: lastPaid?.paid_at
        ? payDayLabel(lastPaid.paid_at, COMPANY_TZ)
        : '—',
      lastPaymentReference: lastPaid?.reference ?? '—',
      thisWeekLabel: current
        ? (current.label ?? rangeLabel(current.starts_on, current.ends_on, COMPANY_TZ))
        : '—',
      thisWeekTotal: current ? dollars(current.cents) : 0,
      thisWeekLegCount: current ? Number(current.legs) : 0,
      // NOT nextPaymentLabel: that is when the already-closed periods pay.
      // This is when the week currently accruing will pay once it closes.
      thisWeekPaysOnLabel: current ? payDayLabel(current.pays_at, COMPANY_TZ) : '—',
      holdRule: HOLD_RULE,
    };
    return reply.send({ summary });
  });
}
