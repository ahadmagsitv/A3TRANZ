/**
 * Phase 4 check — the admin write path.
 *
 * This is the money code. The assertions that matter are the ones about not
 * paying twice, not editing a paid period, and not letting a role that may
 * only VIEW payroll close it out.
 */
import assert from 'node:assert/strict';
import { INSPECTION_ITEMS, can } from '@a3/domain';
import { build } from './server.ts';
import { pool, q, tx } from './db.ts';
import { reseed } from './testdb.ts';

reseed();

const app = build();
await app.ready();

const call = (method: string, url: string, token: string, body?: unknown) =>
  app.inject({
    method: method as 'POST',
    url,
    payload: body as object | undefined,
    headers: { authorization: `Bearer ${token}` },
  });

await q('DELETE FROM login_attempts');
// Normalise at entry: this suite deactivates a driver and marks a period paid,
// so an aborted run would otherwise leave the next one unable to even log in.
await q(`UPDATE users SET active = true WHERE role = 'driver'`);

const login = async (email: string) => {
  const r = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password: 'a3transport' },
  });
  assert.equal(r.statusCode, 200, r.body);
  return r.json().token as string;
};

const { rows: [adminRow] } = await q<{ id: string; email: string }>(
  `SELECT id, email FROM users WHERE role = 'admin' LIMIT 1`,
);
const { rows: [driverRow] } = await q<{ id: string; email: string }>(
  `SELECT id, email FROM users WHERE role = 'driver' ORDER BY id LIMIT 1`,
);
const { rows: [custRow] } = await q<{ id: string }>(`SELECT id FROM customers LIMIT 1`);

const admin = adminRow!;
const driver = driverRow!;
const adminToken = await login(admin.email);
const driverToken = await login(driver.email);

// A real assistant manager, to prove the payroll capability split.
await q(
  `INSERT INTO users (id,email,password_hash,name,initials,role,base,active)
   SELECT 'USR-AM','am@a3transport.com',password_hash,'Alex Morgan','AM',
          'assistant_manager','Houston',true
     FROM users WHERE id = $1
   ON CONFLICT (id) DO UPDATE SET active = true, role = 'assistant_manager'`,
  [admin.id],
);
const amToken = await login('am@a3transport.com');

const newDraft = (over: Record<string, unknown> = {}) => ({
  title: 'Container to Katy',
  type: 'import',
  customerId: custRow!.id,
  description: 'Test job',
  containerNo: 'MSCU-000111-2',
  pickupLocation: 'Terminal B, Port of Houston',
  deliveryLocation: 'Katy DC',
  startDate: new Date().toISOString(),
  dueDate: new Date(Date.now() + 86_400_000).toISOString(),
  priority: 'medium',
  price: 120,
  legs: [
    { kind: 'pickup', driverId: driver.id, amount: 40 },
    { kind: 'loading', driverId: driver.id, amount: 40 },
    { kind: 'delivery', driverId: driver.id, amount: 40 },
  ],
  driverId: driver.id,
  truckId: 'TRK-118',
  chassisId: 'CH-4402',
  ...over,
});

// ── the leg-split validator refuses before anything is written ──────────────
{
  const { rows: before } = await q<{ n: string }>(`SELECT count(*)::text n FROM jobs`);

  const bad = await call('POST', '/jobs', adminToken, newDraft({
    legs: [
      { kind: 'pickup', driverId: driver.id, amount: 40 },
      { kind: 'loading', driverId: driver.id, amount: 45 },
      { kind: 'delivery', driverId: driver.id, amount: 45 },
    ],
  }));
  assert.equal(bad.statusCode, 422, bad.body);
  assert.equal(bad.json().code, 'leg_split');
  assert.equal(
    bad.json().message,
    'Legs total $130.00 but the job price is $120.00 — they must match before you can create the job.',
    'the API refuses in W4-validation-error’s exact words',
  );

  const { rows: after } = await q<{ n: string }>(`SELECT count(*)::text n FROM jobs`);
  assert.equal(after[0]!.n, before[0]!.n, 'and no job was created');
}

// ── create ──────────────────────────────────────────────────────────────────
let jobId = '';
{
  const r = await call('POST', '/jobs', adminToken, newDraft());
  assert.equal(r.statusCode, 201, r.body);
  const job = r.json().job;
  jobId = job.id;

  assert.match(job.id, /^A3-\d{4}$/, 'ids follow the design form');
  assert.ok(!job.id.includes('#'), "and never carry a '#'");
  assert.equal(job.status, 'pending');
  assert.equal(job.step, 'pretrip');
  assert.equal(job.price, 120);
  assert.equal(job.legs.length, 3);
  assert.equal(job.legs.reduce((n: number, l: any) => n + l.amount, 0), 120);

  const { rows } = await q<{ n: string }>(
    `SELECT count(*)::text n FROM notifications WHERE job_id = $1 AND kind='job_assigned'`,
    [jobId],
  );
  assert.equal(rows[0]!.n, '1', 'the driver was told');
}

// ── a driver cannot create or edit a job ────────────────────────────────────
{
  assert.equal((await call('POST', '/jobs', driverToken, newDraft())).statusCode, 403);
  assert.equal(
    (await call('PUT', `/jobs/${jobId}`, driverToken, newDraft())).statusCode,
    403,
  );
}

// ── approve refuses a job that was never submitted ──────────────────────────
{
  const r = await call('POST', `/jobs/${jobId}/approve`, adminToken);
  assert.equal(r.statusCode, 422);
  assert.match(r.json().message, /not been submitted/i);
  assert.equal(
    (await q(`SELECT 1 FROM pay_lines WHERE job_id = $1`, [jobId])).rowCount,
    0,
    'and accrued nothing',
  );
}

/** Drive the job to AWAITING APPROVAL through the real driver routes. */
const driveToSubmitted = async (id: string): Promise<void> => {
  for (const item of INSPECTION_ITEMS) {
    await call('POST', `/jobs/${id}/inspection/${item.id}`, driverToken, {
      result: 'pass',
    });
  }
  await call('POST', `/jobs/${id}/advance`, driverToken, { step: 'pretrip' });
  await call('POST', `/jobs/${id}/evidence/pickup/0`, driverToken, { key: 'k/0.jpg' });
  await call('POST', `/jobs/${id}/evidence/pickup/1`, driverToken, { key: 'k/1.jpg' });
  await call('POST', `/jobs/${id}/seal-number`, driverToken, { sealNo: 'SL-1' });
  await call('POST', `/jobs/${id}/advance`, driverToken, { step: 'pickup' });
  for (let s = 0; s < 3; s++) {
    await call('POST', `/jobs/${id}/evidence/load/${s}`, driverToken, { key: `k/l${s}.jpg` });
  }
  await call('POST', `/jobs/${id}/advance`, driverToken, { step: 'load' });
  for (let s = 0; s < 4; s++) {
    await call('POST', `/jobs/${id}/evidence/delivery/${s}`, driverToken, {
      key: `k/d${s}.jpg`,
    });
  }
  const r = await call('POST', `/jobs/${id}/submit`, driverToken);
  assert.equal(r.statusCode, 200, `submit failed: ${r.body}`);
};

await driveToSubmitted(jobId);

// ── APPROVE IS IDEMPOTENT AND CANNOT DOUBLE-PAY ─────────────────────────────
{
  const first = await call('POST', `/jobs/${jobId}/approve`, adminToken);
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().job.status, 'done');
  assert.ok(first.json().job.approvedAt);
  assert.equal(first.json().accrued, 3, 'three legs accrued');

  const { rows: once } = await q<{ n: string; cents: string }>(
    `SELECT count(*)::text n, coalesce(sum(amount_cents),0)::text cents
       FROM pay_lines WHERE job_id = $1`,
    [jobId],
  );
  assert.equal(once[0]!.n, '3');
  assert.equal(once[0]!.cents, '12000', 'the legs accrued exactly the job price');

  // Replay it three times. Nothing may change.
  for (let i = 0; i < 3; i++) {
    const again = await call('POST', `/jobs/${jobId}/approve`, adminToken);
    assert.equal(again.statusCode, 200, again.body);
    assert.equal(again.json().accrued, 0, 'a replayed approve accrues nothing');
  }

  const { rows: after } = await q<{ n: string; cents: string }>(
    `SELECT count(*)::text n, coalesce(sum(amount_cents),0)::text cents
       FROM pay_lines WHERE job_id = $1`,
    [jobId],
  );
  assert.deepEqual(
    { n: after[0]!.n, cents: after[0]!.cents },
    { n: '3', cents: '12000' },
    'four approvals paid exactly once',
  );
}

// ── even a forced double insert cannot double-pay ───────────────────────────
{
  // Bypass the route entirely and try to write the same leg twice.
  const { rows } = await q<{ period_id: string; leg_kind: string; amount_cents: number }>(
    `SELECT period_id, leg_kind, amount_cents FROM pay_lines WHERE job_id = $1 LIMIT 1`,
    [jobId],
  );
  const line = rows[0]!;
  await assert.rejects(
    () =>
      q(
        `INSERT INTO pay_lines (period_id,job_id,leg_kind,driver_id,amount_cents)
         VALUES ($1,$2,$3,$4,$5)`,
        [line.period_id, jobId, line.leg_kind, driver.id, line.amount_cents],
      ),
    /duplicate key/,
    'the primary key refuses a second row for the same leg — not just the route',
  );
}

// ── an approved job can no longer be edited ─────────────────────────────────
{
  const r = await call('PUT', `/jobs/${jobId}`, adminToken, newDraft({ price: 999 }));
  assert.equal(r.statusCode, 422);
  assert.match(r.json().message, /no longer be edited/i);
  const { rows } = await q<{ c: number }>(`SELECT price_cents c FROM jobs WHERE id = $1`, [
    jobId,
  ]);
  assert.equal(rows[0]!.c, 12000, 'the money that was accrued still matches the job');
}

// ── send back: refuses without a reason, warns when it works ────────────────
{
  const r2 = await call('POST', '/jobs', adminToken, newDraft({ title: 'Send-back job' }));
  const sendBackId = r2.json().job.id;
  await driveToSubmitted(sendBackId);

  assert.equal(
    (await call('POST', `/jobs/${sendBackId}/send-back`, adminToken, { reason: '  ' }))
      .statusCode,
    400,
    'a send-back needs to say what is wrong',
  );

  const sent = await call('POST', `/jobs/${sendBackId}/send-back`, adminToken, {
    reason: 'Bill of lading is out of focus — reshoot it.',
  });
  assert.equal(sent.statusCode, 200, sent.body);
  assert.equal(sent.json().job.status, 'in_progress');
  assert.equal(sent.json().job.submittedAt, null);
  assert.match(
    sent.json().warning,
    /already told/i,
    'the customer was told on SUBMIT, so the office is warned',
  );

  assert.equal(
    (await q(`SELECT 1 FROM job_notes WHERE job_id = $1`, [sendBackId])).rowCount,
    1,
    'the reason is on the record',
  );
  assert.equal(
    (await call('POST', `/jobs/${sendBackId}/approve`, adminToken)).statusCode,
    422,
    'and a sent-back job is no longer approvable until it is resubmitted',
  );
}

// ── payroll: view vs mark-paid is a real capability split ───────────────────
{
  assert.equal(can('assistant_manager', 'viewPayroll'), true);
  assert.equal(can('assistant_manager', 'markPayrollPaid'), false);

  const { rows: [period] } = await q<{ id: string }>(
    `SELECT period_id AS id FROM pay_lines WHERE job_id = $1 LIMIT 1`,
    [jobId],
  );
  const periodId = period!.id;

  assert.equal(
    (await call('GET', '/payroll/periods', amToken)).statusCode,
    200,
    'an assistant manager may READ payroll',
  );
  assert.equal(
    (await call('POST', `/payroll/periods/${periodId}/mark-paid`, amToken, {
      reference: 'SNEAKY-1',
      paidAt: new Date().toISOString(),
    })).statusCode,
    403,
    'but may never mark it paid',
  );
  assert.equal(
    (await call('POST', `/payroll/periods/${periodId}/mark-paid`, driverToken, {
      reference: 'SNEAKY-2',
      paidAt: new Date().toISOString(),
    })).statusCode,
    403,
    'and neither may a driver',
  );

  // Editing a line is web-only and must move the driver's total too.
  const beforeTotal = (await call('GET', '/earnings/summary', driverToken)).json().summary
    .pendingTotal;
  const edit = await call('PATCH', `/payroll/periods/${periodId}/line`, adminToken, {
    driverId: driver.id,
    jobId,
    legKind: 'pickup',
    amount: 55,
  });
  assert.equal(edit.statusCode, 200, edit.body);
  const afterTotal = (await call('GET', '/earnings/summary', driverToken)).json().summary
    .pendingTotal;
  assert.ok(
    Math.abs(afterTotal - (beforeTotal + 15)) < 0.005,
    `the driver's app sees the office's edit (${beforeTotal} → ${afterTotal})`,
  );

  // Mark paid, twice.
  const ref = `WIRE-${Date.now()}`;
  const paid = await call('POST', `/payroll/periods/${periodId}/mark-paid`, adminToken, {
    reference: ref,
    paidAt: new Date().toISOString(),
  });
  assert.equal(paid.statusCode, 200, paid.body);
  assert.equal(paid.json().period.status, 'paid');
  assert.equal(paid.json().period.reference, ref);

  const replay = await call('POST', `/payroll/periods/${periodId}/mark-paid`, adminToken, {
    reference: 'DIFFERENT-REF',
    paidAt: new Date().toISOString(),
  });
  assert.equal(replay.statusCode, 200);
  assert.equal(
    replay.json().period.reference,
    ref,
    'a replay never overwrites the reference of the payment that actually happened',
  );

  // A paid period is a record of something that happened at a bank.
  const edited = await call('PATCH', `/payroll/periods/${periodId}/line`, adminToken, {
    driverId: driver.id,
    jobId,
    legKind: 'pickup',
    amount: 999,
  });
  assert.equal(edited.statusCode, 422, 'a paid period cannot be edited');
  assert.match(edited.json().message, /already been paid/i);
}

// ── W9: add driver, and W8-confirm: deactivate logs them out ───────────────
{
  const email = `new.driver.${Date.now()}@a3transport.com`;
  const created = await call('POST', '/drivers', adminToken, {
    name: 'Sam Rivera',
    email,
    phone: '+1 713 555 0999',
  });
  assert.equal(created.statusCode, 201, created.body);
  const newId = created.json().driver.id;
  assert.match(newId, /^DRV-\d{3}$/);
  assert.equal(created.json().driver.initials, 'SR');

  // No password came back, and none was set to anything guessable.
  assert.equal(created.json().driver.password, undefined);
  assert.equal(
    (await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'a3transport' },
    })).statusCode,
    401,
    'a new driver has no shared default password',
  );
  assert.equal(
    (await q(`SELECT 1 FROM password_resets WHERE user_id = $1`, [newId])).rowCount,
    1,
    'they get an invite link instead (§9 B2)',
  );

  assert.equal(
    (await call('POST', '/drivers', adminToken, { name: 'Dup', email })).statusCode,
    409,
    'and an email cannot be reused',
  );

  // Deactivation kills the live session immediately.
  const victimToken = await login(driver.email);
  assert.equal((await call('GET', '/auth/me', victimToken)).statusCode, 200);
  const off = await call('POST', `/drivers/${driver.id}/deactivate`, adminToken);
  assert.equal(off.statusCode, 200, off.body);
  // 401, not 403: deactivating REVOKES the sessions, so there is no longer a
  // session to evaluate — strictly stronger than leaving a valid session that
  // merely fails an active check. Either way the next request cannot act.
  assert.equal(
    (await call('GET', '/auth/me', victimToken)).statusCode,
    401,
    'W8-confirm logs them out on the next request — the reason sessions are rows',
  );
  assert.equal(
    (await q(`SELECT 1 FROM sessions WHERE user_id = $1 AND revoked_at IS NULL`, [driver.id]))
      .rowCount,
    0,
    'every live session for that driver was revoked, not just the one in hand',
  );
  await q(`UPDATE users SET active = true WHERE id = $1`, [driver.id]);
}

// ── fleet return-to-service keeps the defect record ────────────────────────
{
  const { rows } = await q<{ id: string; unit_id: string }>(
    `SELECT id, unit_id FROM defects LIMIT 1`,
  );
  if (rows[0]) {
    await q(`UPDATE fleet_units SET status='out_of_service' WHERE id = $1`, [
      rows[0].unit_id,
    ]);
    const r = await call('POST', `/fleet/${rows[0].unit_id}/return-to-service`, adminToken);
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().unit.status, 'in_service');
    assert.equal(
      (await q(`SELECT 1 FROM defects WHERE id = $1`, [rows[0].id])).rowCount,
      1,
      'the defect outlives the repair — it is why the unit was pulled',
    );
    assert.equal(
      (await call('POST', `/fleet/${rows[0].unit_id}/return-to-service`, adminToken))
        .statusCode,
      422,
      'and a unit already in service is not returned again',
    );
  }
}

await q(`DELETE FROM users WHERE id = 'USR-AM'`);
// ── W7 → W10: "Message" starts the conversation with a driver ───────────────
{
  // The button used to link at the inbox with no context, and nothing there
  // could start a chat — threads only ever came from the seed, so on a real
  // database the office could never open one.
  const jobId = (await call('GET', '/jobs', adminToken)).json().jobs[0].id as string;
  const { rows: [owner] } = await q<{ driver_id: string }>(
    `SELECT driver_id FROM jobs WHERE id = $1`,
    [jobId],
  );

  const first = await call('POST', '/chat/threads', adminToken, {
    driverId: owner!.driver_id,
  });
  assert.equal(first.statusCode, 201, first.body);
  const threadId = first.json().threadId as string;

  // Pressing Message twice must not produce a second conversation.
  const second = await call('POST', '/chat/threads', adminToken, {
    driverId: owner!.driver_id,
  });
  assert.equal(second.json().threadId, threadId, 'starting a chat is idempotent');

  // One per JOB, not per driver — a driver on six jobs has six conversations.
  // The route picks the driver's most recent job, so ask the thread which.
  const { rows: count } = await q<{ n: string }>(
    `SELECT count(*)::text n FROM threads
      WHERE job_id = (SELECT job_id FROM threads WHERE id = $1)`,
    [threadId],
  );
  assert.equal(count[0]!.n, '1', 'and leaves exactly one thread for that job');

  // It is a real thread: it accepts a message and the driver can read it.
  const sent = await call('POST', `/chat/threads/${threadId}/messages`, adminToken, {
    body: 'Confirming pickup window.',
  });
  assert.equal(sent.statusCode, 201, sent.body);

  // Messages are job-scoped, so a driver with no jobs has nothing to attach to.
  const spare = await call('POST', '/drivers', adminToken, {
    name: 'No Jobs',
    email: `nojobs.${Date.now()}@a3transport.com`,
    phone: '555-0005',
    base: 'Houston',
    tempPassword: 'start1234',
  });
  const refused = await call('POST', '/chat/threads', adminToken, {
    driverId: spare.json().driver.id,
  });
  assert.equal(refused.statusCode, 422);
  assert.match(refused.json().message, /no jobs yet/);

  // Drivers do not open conversations with the office.
  assert.equal(
    (await call('POST', '/chat/threads', await login(driver.email), {
      driverId: owner!.driver_id,
    })).statusCode,
    403,
  );
}

// ── W4: the legs are what assign a job ──────────────────────────────────────
{
  // The job card assigns a driver per LEG and has no separate field for the
  // job itself, so the job's driver — who runs the pre-trip, captures and
  // submits — is derived from the pickup leg. Without it every job created in
  // the console stayed NULL and no driver ever saw it.
  const other = await call('POST', '/drivers', adminToken, {
    name: 'Leg Only',
    email: `legonly.${Date.now()}@a3transport.com`,
    phone: '555-0004',
    base: 'Houston',
    tempPassword: 'start1234',
  });
  const otherId = other.json().driver.id as string;

  const legsFor = (id: string) => [
    { kind: 'pickup', driverId: id, amount: 30 },
    { kind: 'loading', driverId: id, amount: 30 },
    { kind: 'delivery', driverId: id, amount: 30 },
  ];

  const made = await call('POST', '/jobs', adminToken, {
    ...newDraft({ title: 'Assigned by its legs', driverId: null }),
    legs: legsFor(driver.id),
    price: 90,
  });
  assert.equal(made.statusCode, 201, made.body);
  const jobId = made.json().job.id as string;
  assert.equal(
    made.json().job.driverId,
    driver.id,
    'the job takes its driver from the pickup leg',
  );

  // Changing the leg drivers is how a job is reassigned.
  const moved = await call('PUT', `/jobs/${jobId}`, adminToken, {
    ...newDraft({ title: 'Assigned by its legs', driverId: null }),
    legs: legsFor(otherId),
    price: 90,
  });
  assert.equal(moved.statusCode, 200, moved.body);
  assert.equal(moved.json().job.driverId, otherId, 'and reassigned by them too');

  // The assigned driver sees it and can work it; nobody else can.
  const ownerToken = (await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: other.json().driver.email, password: 'start1234' },
  })).json().token as string;
  assert.ok(
    (await call('GET', '/jobs', ownerToken)).json().jobs.some((j: { id: string }) => j.id === jobId),
    'the assigned driver sees the job',
  );

  const strangerToken = await login(driver.email);
  assert.equal(
    (await call('POST', `/jobs/${jobId}/advance`, strangerToken, { step: 'pretrip' })).statusCode,
    404,
    'a driver no longer on the job cannot work it',
  );

  // `/assign` still moves both the job and its legs, for callers that use it.
  const reassigned = await call('POST', `/jobs/${jobId}/assign`, adminToken, {
    driverId: driver.id,
  });
  assert.equal(reassigned.json().job.driverId, driver.id);
  const { rows: legs } = await q<{ driver_id: string }>(
    `SELECT driver_id FROM job_legs WHERE job_id = $1`,
    [jobId],
  );
  assert.ok(
    legs.every(l => l.driver_id === driver.id),
    'and the legs follow, so the driver doing the work is the one paid',
  );
}

// ── W4: office documents attach to a job and come back downloadable ─────────
{
  // The bytes go to the bucket through /uploads/presign; this route only
  // records the key. What matters is that the key survives the round trip as
  // a URL — an attachment nobody can open is a filename, not a document.
  const jobId = (await call('GET', '/jobs', adminToken)).json().jobs[0].id as string;
  const before = (await call('GET', `/jobs/${jobId}`, adminToken)).json().job.attachments.length;

  const presign = await call('POST', '/uploads/presign', adminToken, {
    jobId,
    purpose: 'attachment',
    contentType: 'application/pdf',
    contentLength: 8,
  });
  assert.equal(presign.statusCode, 200, presign.body);
  const { key, fields } = presign.json() as {
    key: string;
    fields: Record<string, string>;
  };
  // A PDF is a `raw` asset, not an image — Cloudinary serves the two from
  // different paths, and the delivery URL has to name the right one.
  assert.match(key, /\.pdf$/);
  assert.equal(fields.public_id, key.replace(/\.[^./]+$/, ''), 'extension stripped');

  const attached = await call('POST', `/jobs/${jobId}/attachments`, adminToken, {
    files: [{ key, name: 'Manifest.pdf', sizeBytes: 8, kind: 'document' }],
  });
  assert.equal(attached.statusCode, 200, attached.body);
  const list = attached.json().job.attachments as {
    id: string;
    name: string;
    origin: string;
    uri: string | null;
  }[];
  assert.equal(list.length, before + 1);

  const mine = list.find(a => a.name === 'Manifest.pdf')!;
  assert.equal(mine.origin, 'admin', 'office documents are download-only for drivers');
  assert.ok(mine.uri, 'the attachment comes back with a URL');
  assert.match(mine.uri!, /res\.cloudinary\.com/, 'served from the media CDN');
  assert.match(mine.uri!, /\/raw\/authenticated\//, 'as a signed raw asset, not an image');

  // An executable is not a document.
  assert.equal(
    (await call('POST', '/uploads/presign', adminToken, {
      jobId,
      purpose: 'attachment',
      contentType: 'application/x-msdownload',
      contentLength: 10,
    })).statusCode,
    415,
  );

  const removed = await call('DELETE', `/jobs/${jobId}/attachments/${mine.id}`, adminToken);
  assert.equal(removed.statusCode, 200);
  assert.equal(removed.json().job.attachments.length, before);
}

// ── W17: a fleet unit can be created, and only once ─────────────────────────
{
  // Trucks and chassis had no create path at all — they only came from the
  // seed, so an empty database could not produce a job: W4 needs a vehicle and
  // a chassis to assign.
  const id = `TRK-T${Date.now() % 100000}`;
  const made = await call('POST', '/fleet', adminToken, {
    id: id.toLowerCase(),
    kind: 'truck',
    plate: 'TX 00001',
  });
  assert.equal(made.statusCode, 201, made.body);
  assert.equal(made.json().unit.id, id, 'the unit number is normalised to upper case');
  assert.equal(made.json().unit.status, 'in_service');
  assert.equal(
    made.json().unit.lastInspectionAt,
    null,
    'a unit nobody has inspected has no inspection date',
  );

  // The id is the number painted on the vehicle, so it is a natural key.
  assert.equal(
    (await call('POST', '/fleet', adminToken, { id, kind: 'truck' })).statusCode,
    409,
    'the same unit number cannot be added twice',
  );

  assert.ok(
    (await call('GET', '/fleet', adminToken)).json().units.some(
      (u: { id: string }) => u.id === id,
    ),
    'and it shows up on the fleet',
  );
}

// ── W8: deactivating locks a driver out, reactivating lets them back ────────
{
  // The whole point of sessions being rows rather than JWTs: a stood-down
  // driver must stop being able to capture evidence NOW, not when a token
  // happens to expire.
  const email = `w8.${Date.now()}@a3transport.com`;
  const made = await call('POST', '/drivers', adminToken, {
    name: 'W8 Driver',
    email,
    phone: '555-0003',
    base: 'Houston',
    tempPassword: 'start1234',
  });
  const id = made.json().driver.id as string;

  const signIn = async () =>
    app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: 'start1234' } });

  const first = await signIn();
  assert.equal(first.statusCode, 200);
  const theirToken = first.json().token as string;
  assert.equal(
    (await call('GET', '/jobs', theirToken)).statusCode,
    200,
    'an active driver can work',
  );

  const off = await call('POST', `/drivers/${id}/deactivate`, adminToken);
  assert.equal(off.statusCode, 200);
  assert.equal(off.json().driver.active, false);
  assert.equal(
    off.json().driver.email,
    email,
    'the response is a whole driver, not just the flag the table re-renders',
  );

  // The token they were already holding dies with the account.
  assert.equal(
    (await call('GET', '/jobs', theirToken)).statusCode,
    401,
    'a live token stops working the moment the driver is stood down',
  );
  assert.equal(
    (await call('GET', '/drivers/me', theirToken)).statusCode,
    401,
    'and so does every other route — the check is in the session, not per route',
  );
  const refused = await signIn();
  assert.equal(refused.statusCode, 403);
  assert.equal(refused.json().code, 'inactive_account');

  const on = await call('POST', `/drivers/${id}/activate`, adminToken);
  assert.equal(on.statusCode, 200);
  assert.equal(on.json().driver.active, true);
  assert.equal(
    (await signIn()).statusCode,
    200,
    'reactivating lets them sign in again',
  );

  // Only a role holding `manageDrivers` may flip either direction. An
  // assistant manager runs most of the office and still cannot.
  //
  // Its own user rather than the shared one at the top of this file: earlier
  // blocks change that account's password and revoke its sessions, so reusing
  // it here couples this assertion to their order. Borrowing the hash of the
  // driver just created gives a known password without a second hash.
  await q(
    `INSERT INTO users (id,email,password_hash,name,initials,role,base,active)
     SELECT 'USR-AM-W8',$1,password_hash,'W8 Manager','WM',
            'assistant_manager','Houston',true
       FROM users WHERE id = $2
     ON CONFLICT (id) DO UPDATE SET active = true`,
    [`w8.am.${Date.now()}@a3transport.com`, id],
  );
  const { rows: [amRow] } = await q<{ email: string }>(
    `SELECT email FROM users WHERE id = 'USR-AM-W8'`,
  );
  // Signed in with the driver's password, since that is whose hash it borrowed
  // — the shared `login` helper assumes the seeded one.
  const amLogin = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: amRow!.email, password: 'start1234' },
  });
  assert.equal(amLogin.statusCode, 200, amLogin.body);
  const am = amLogin.json().token as string;
  assert.equal(
    (await call('POST', `/drivers/${id}/deactivate`, am)).statusCode,
    403,
    'manageDrivers gates standing a driver down',
  );
  assert.equal(
    (await call('POST', `/drivers/${id}/activate`, am)).statusCode,
    403,
    'and gates putting them back',
  );
}

// ── the admin's temporary password is a real credential ─────────────────────
{
  // Standing in until invite emails send. The interesting part is not that a
  // row is created — it is that the driver can actually sign in with what the
  // admin typed, and that a weak one is refused at the boundary rather than
  // becoming the only thing guarding a real account.
  const email = `temp.pw.${Date.now()}@a3transport.com`;
  const created = await call('POST', '/drivers', adminToken, {
    name: 'Temp Pw',
    email,
    phone: '555-0000',
    base: 'Houston',
    tempPassword: 'start1234',
  });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(
    created.json().driver.tempPassword,
    undefined,
    'the password is never echoed back',
  );

  const signedIn = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password: 'start1234' },
  });
  assert.equal(signedIn.statusCode, 200, 'the driver can sign in with it');

  assert.equal(
    (await call('POST', '/drivers', adminToken, {
      name: 'Too Weak',
      email: `weak.${Date.now()}@a3transport.com`,
      phone: '555-0001',
      base: 'Houston',
      tempPassword: 'short',
    })).statusCode,
    400,
    'a password under 8 characters is refused',
  );

  // Omitting it still works: that is the path once mail sends, and it must
  // leave an account nobody can sign into without the invite link.
  const noPw = await call('POST', '/drivers', adminToken, {
    name: 'Invite Only',
    email: `invite.${Date.now()}@a3transport.com`,
    phone: '555-0002',
    base: 'Houston',
  });
  assert.equal(noPw.statusCode, 201, noPw.body);
}

await app.close();
await pool.end();
console.log('admin: money paths hold — approve pays once, paid periods are immutable');
void tx;
