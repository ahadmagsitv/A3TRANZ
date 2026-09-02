/**
 * Phase 2 check. Reads across all 8 domains against the seeded database.
 *
 * The interesting assertions are not "200 OK" — they are that scoping holds,
 * that derived values are actually derived, and that the two payroll views of
 * the same rows agree.
 */
import assert from 'node:assert/strict';
import { TOTAL_REQUIRED_PHOTOS } from '@a3/domain';
import { build } from './server.ts';
import { pool, q } from './db.ts';
import { reseed } from './testdb.ts';

reseed();

const app = build();
await app.ready();

const call = (method: string, url: string, token?: string) =>
  app.inject({
    method: method as 'GET',
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

const login = async (email: string): Promise<string> => {
  const r = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password: 'a3transport' },
  });
  assert.equal(r.statusCode, 200, `login failed for ${email}: ${r.body}`);
  return r.json().token as string;
};

await q('DELETE FROM login_attempts');
const { rows: users } = await q<{ id: string; email: string; role: string }>(
  `SELECT id, email, role FROM users ORDER BY role, id`,
);
const driver = users.find(u => u.role === 'driver')!;
const otherDriver = users.filter(u => u.role === 'driver')[1];
const admin = users.find(u => u.role === 'admin')!;

const driverToken = await login(driver.email);
const adminToken = await login(admin.email);

// ── jobs: scoping is the caller's identity, not a parameter ─────────────────
{
  const asAdmin = await call('GET', '/jobs', adminToken);
  assert.equal(asAdmin.statusCode, 200);
  const all = asAdmin.json().jobs as any[];
  assert.equal(all.length, 11, 'the office sees every job');

  const asDriver = await call('GET', '/jobs', driverToken);
  const mine = asDriver.json().jobs as any[];
  assert.ok(mine.length > 0);
  assert.ok(
    mine.every(j => j.driverId === driver.id),
    'a driver sees only their own jobs',
  );

  if (otherDriver) {
    // The driver asks for someone else's list explicitly. It must be ignored.
    const widened = await call('GET', `/jobs?driverId=${otherDriver.id}`, driverToken);
    const rows = widened.json().jobs as any[];
    assert.ok(
      rows.every(j => j.driverId === driver.id),
      'a driver cannot widen their scope by passing another driver id',
    );

    const foreign = all.find(j => j.driverId === otherDriver.id);
    if (foreign) {
      const r = await call('GET', `/jobs/${foreign.id}`, driverToken);
      assert.equal(
        r.statusCode,
        404,
        "another driver's job is 404, not 403 — a 403 would confirm it exists",
      );
    }
  }
}

// ── the job payload: derived values and the rebuilt slot map ────────────────
{
  const { rows: [submitted] } = await q<{ id: string }>(
    `SELECT id FROM jobs WHERE status = 'awaiting_approval' LIMIT 1`,
  );
  const r = await call('GET', `/jobs/${submitted!.id}`, adminToken);
  assert.equal(r.statusCode, 200);
  const job = r.json().job;

  // Evidence is rebuilt from SLOT_SPECS, not stored as labels.
  const slots = [...job.evidence.pickup, ...job.evidence.load, ...job.evidence.delivery];
  assert.equal(slots.length, TOTAL_REQUIRED_PHOTOS, '2 + 3 + 4 slots');
  assert.ok(slots.every(s => s.uri), 'a submitted job has all nine');
  assert.ok(
    slots.every(s => typeof s.label === 'string' && s.label.length > 0),
    'every slot is labelled — never an unlabelled grid',
  );
  assert.equal(job.evidence.pickup[0].label, '1 · Chassis + container no.');

  // Labels are computed, not stored.
  assert.ok(job.dueLabel, 'dueLabel is served');
  assert.ok(/^(Today|Tomorrow|Yesterday|[A-Z][a-z]{2} \d+),/.test(job.dueLabel), job.dueLabel);
  assert.ok(job.assignedLabel);
  assert.equal(job.timezone, 'America/Chicago');

  assert.equal(typeof job.overdue, 'boolean');
  assert.equal(typeof job.dueToday, 'boolean');
  assert.ok(job.timeline.length > 0, 'the office gets a derived timeline');
  assert.ok(job.version >= 1);
}

// ── money crosses the wire in dollars, having been stored in cents ──────────
{
  const { rows: [priced] } = await q<{ id: string; price_cents: number }>(
    `SELECT id, price_cents FROM jobs WHERE price_cents IS NOT NULL LIMIT 1`,
  );
  assert.ok(priced, 'the seed has at least one priced job');
  const job = (await call('GET', `/jobs/${priced.id}`, adminToken)).json().job;
  assert.equal(
    job.price,
    priced.price_cents / 100,
    'cents are converted back to dollars once, at the edge',
  );
  assert.equal(Number.isInteger(priced.price_cents), true, 'stored as integer cents');

  const legged = (await call('GET', '/jobs', adminToken)).json().jobs.find(
    (j: any) => j.legs.length > 0,
  );
  if (legged) {
    const { rows } = await q<{ n: string }>(
      `SELECT coalesce(sum(amount_cents),0)::text n FROM job_legs WHERE job_id = $1`,
      [legged.id],
    );
    const legSum = legged.legs.reduce((n: number, l: any) => n + l.amount, 0);
    assert.ok(
      Math.abs(legSum - Number(rows[0]!.n) / 100) < 0.005,
      'leg amounts survive the cents round-trip',
    );
  }
}

// ── overdue is a predicate, because there is no column to read ──────────────
{
  assert.equal(
    (await q(`SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
               WHERE t.typname = 'job_status' AND e.enumlabel = 'overdue'`)).rowCount,
    0,
    "the job_status enum has no 'overdue' member — it is derived",
  );

  const r = await call('GET', '/jobs?overdue=true', adminToken);
  const rows = r.json().jobs as any[];
  assert.ok(
    rows.every(j => j.overdue === true && j.status !== 'done'),
    'the overdue filter and the derived flag agree',
  );
}

// ── a driver payload carries no office-only surface ─────────────────────────
{
  const mine = (await call('GET', '/jobs', driverToken)).json().jobs as any[];
  assert.ok(
    mine.every(j => j.timeline.length === 0),
    'the timeline is an office view; drivers do not receive it',
  );
  const withLegs = mine.find(j => j.legs.length > 0);
  if (withLegs) {
    const own = withLegs.legs.find((l: any) => l.driverId === driver.id);
    assert.equal(own?.driverLabel, 'You', "a driver's own leg reads 'You'");
  }
}

// ── drivers / overview ──────────────────────────────────────────────────────
{
  const me = await call('GET', '/drivers/me', driverToken);
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().driver.id, driver.id);

  const ov = (await call('GET', '/drivers/me/overview', driverToken)).json().overview;
  assert.match(ov.greeting, /^(Morning|Afternoon|Evening), /, ov.greeting);
  assert.match(ov.dateLabel, / · /, ov.dateLabel);
  assert.equal(typeof ov.pending, 'number');
  assert.equal(typeof ov.overdue, 'number');

  const counted = (await call('GET', '/jobs?status=pending', driverToken)).json()
    .jobs as any[];
  assert.equal(
    ov.pending,
    counted.length,
    "the home card's count and the jobs list agree",
  );

  assert.equal(
    (await call('GET', '/drivers', driverToken)).statusCode,
    403,
    'the driver roster is office-only',
  );
  assert.equal((await call('GET', '/drivers', adminToken)).statusCode, 200);
}

// ── fleet: outOfService is derived from status ──────────────────────────────
{
  // adminToken: the fleet list is office-only. The assertion here is about the
  // derived field, not about who may read it.
  const units = (await call('GET', '/fleet', adminToken)).json().units as any[];
  assert.ok(units.length > 0);
  assert.ok(
    units.every(u => u.outOfService === (u.status === 'out_of_service')),
    'outOfService and status can never disagree',
  );

  const oos = units.find(u => u.outOfService);
  assert.ok(oos, 'the seed has an out-of-service unit');
  const defect = (await call('GET', `/fleet/${oos.id}/defect`, adminToken)).json().defect;
  assert.ok(defect, 'W18 has a defect to quote');
  assert.ok(defect.note.trim().length > 0, 'and it is never noteless');
  assert.ok(defect.reportedBy, 'and it is attributed');
}

// ── chat: unread derived from thread_reads ─────────────────────────────────
{
  const threads = (await call('GET', '/chat/threads', driverToken)).json().threads as any[];
  assert.ok(threads.length > 0);
  const unreadFlag = (await call('GET', '/chat/unread', driverToken)).json().hasUnread;
  assert.equal(
    unreadFlag,
    threads.some(t => t.unread > 0),
    'the tab dot and the per-thread counts are computed from the same rows',
  );

  const withMsgs = threads.find(t => t.preview);
  const msgs = (
    await call('GET', `/chat/threads/${withMsgs.id}/messages`, driverToken)
  ).json().messages as any[];
  assert.ok(msgs.length > 0);
  assert.ok(
    msgs.every(m => m.from === (m.authorId === driver.id ? 'me' : 'them')),
    "`from` is resolved per viewer",
  );

  // The same thread read by the office flips the sides.
  const asAdmin = await call('GET', `/chat/threads/${withMsgs.id}/messages`, adminToken);
  if (asAdmin.statusCode === 200) {
    const adminMsgs = asAdmin.json().messages as any[];
    const mine = msgs.find(m => m.from === 'me');
    if (mine) {
      assert.equal(
        adminMsgs.find(m => m.id === mine.id).from,
        'them',
        'the same row is "me" to its author and "them" to the other party',
      );
    }
  }
}

// ── notifications ───────────────────────────────────────────────────────────
{
  const body = (await call('GET', '/notifications', driverToken)).json();
  const list = body.notifications as any[];
  assert.ok(list.length > 0);
  assert.ok(list.every(n => typeof n.group === 'string' && n.group.length > 0));
  assert.ok(body.icons.job_assigned, 'the glyph is a lookup off kind, not a column');

  const count = (await call('GET', '/notifications/unread', driverToken)).json().count;
  assert.equal(count, list.filter(n => !n.read).length, 'badge and list agree');

  const prefs = (await call('GET', '/notifications/prefs', driverToken)).json().prefs;
  assert.equal(Object.keys(prefs).length, 7, 'one pref per §6.8 trigger');
}

// ── payroll: the two views of one table must agree ─────────────────────────
{
  assert.equal(
    (await call('GET', '/payroll/periods', driverToken)).statusCode,
    403,
    'company-wide payroll is office-only',
  );

  const periods = (await call('GET', '/payroll/periods', adminToken)).json()
    .periods as any[];
  assert.ok(periods.length > 0);

  for (const p of periods) {
    const summed = p.groups.reduce((n: number, g: any) => n + g.amount, 0);
    assert.ok(
      Math.abs(summed - p.amount) < 0.005,
      `period ${p.id}: group sum ${summed} vs total ${p.amount}`,
    );
    assert.equal(p.driverCount, p.groups.length);
    for (const g of p.groups) {
      const itemised = g.lines.reduce((n: number, l: any) => n + l.amount, 0);
      assert.ok(
        Math.abs(itemised + g.moreLegsAmount - g.amount) < 0.005,
        'itemised lines + "N more legs" reconstruct the group total exactly',
      );
      assert.equal(g.lines.length + g.moreLegsCount, g.legCount);
    }
  }

  // Same rows, driver's projection.
  const driverPeriods = (await call('GET', '/earnings/periods', driverToken)).json()
    .periods as any[];
  for (const dp of driverPeriods) {
    const office = periods.find(p => p.id === dp.id);
    const group = office.groups.find((g: any) => g.driverId === driver.id);
    assert.ok(
      Math.abs(group.amount - dp.total) < 0.005,
      `${dp.id}: office says ${group.amount}, the driver's app says ${dp.total}`,
    );
    assert.equal(group.legCount, dp.legCount);
  }

  const summary = (await call('GET', '/earnings/summary', driverToken)).json().summary;
  const pendingSum = driverPeriods
    .filter(p => p.status !== 'paid')
    .reduce((n, p) => n + p.total, 0);
  assert.ok(
    Math.abs(summary.pendingTotal - pendingSum) < 0.005,
    'the M24 summary sums the same statements it links to',
  );
  assert.ok(summary.holdRule.length > 0, 'the hold rule is served, not hardcoded in the app');

  if (otherDriver) {
    assert.equal(
      (await call('GET', `/earnings/summary?driverId=${otherDriver.id}`, driverToken))
        .statusCode,
      403,
      "a driver cannot read another driver's earnings",
    );
  }
}

// ── the capability map is what refuses, not just the UI ─────────────────────
{
  // admin-web renders blocked actions disabled-with-a-lock, which is a UI
  // affordance and not a control: every one of these was reachable by curl
  // with a valid token until the routes named a capability. Read as a table so
  // a new role or a moved route has to come past this list.
  const dispatcher = users.find(u => u.role === 'dispatcher')!;
  const dispatcherToken = await login(dispatcher.email);

  const period = (await call('GET', '/payroll/periods', adminToken)).json()
    .periods[0].id as string;

  const matrix: [string, string, number][] = [
    // Dispatcher is office staff, but TIER3 has no viewPayroll.
    ['dispatcher', `/payroll/periods`, 403],
    ['dispatcher', `/payroll/periods/${period}`, 403],
    // It does have createJobs, and W4's form needs these selects — read yes,
    // manage no. That asymmetry is the point of the tier.
    ['dispatcher', '/customers', 200],
    ['dispatcher', '/fleet', 200],
    // A driver's token is for their own work, not the office's directory.
    ['driver', '/customers', 403],
    ['driver', '/fleet', 403],
    ['driver', '/drivers', 403],
    ['driver', '/payroll/periods', 403],
    // …but everything the driver app actually needs still answers.
    ['driver', '/jobs', 200],
    ['driver', '/drivers/me', 200],
    ['driver', '/earnings/summary', 200],
    ['admin', '/payroll/periods', 200],
    ['admin', '/customers', 200],
  ];

  const tokens: Record<string, string> = {
    driver: driverToken,
    admin: adminToken,
    dispatcher: dispatcherToken,
  };

  for (const [role, url, expected] of matrix) {
    assert.equal(
      (await call('GET', url, tokens[role])).statusCode,
      expected,
      `${role} GET ${url} should be ${expected}`,
    );
  }

  // Locking the directory must not strip the driver's own job of the customer
  // and unit it embeds — that is why mobile never needed /customers.
  const job = (await call('GET', '/jobs/A3-0421', driverToken)).json().job;
  assert.equal(job.customerName, 'Gulf Coast Logistics');
  assert.equal(job.truckId, 'TRK-118');
  assert.ok(job.legs.length > 0, 'legs travel with the job, not a second fetch');
}

await app.close();
await pool.end();
console.log('reads: all 8 domains check out');
