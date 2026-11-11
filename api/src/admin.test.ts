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
  type: 'export',
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

{
  assert.equal((await call('POST', '/jobs', driverToken, newDraft())).statusCode, 403);
  assert.equal(
    (await call('PUT', `/jobs/${jobId}`, driverToken, newDraft())).statusCode,
    403,
  );
}

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

const driveToSubmitted = async (id: string): Promise<void> => {
  for (const item of INSPECTION_ITEMS) {
    await call('POST', `/jobs/${id}/inspection/${item.id}`, driverToken, {
      result: 'pass',
    });
  }
  await call('POST', `/jobs/${id}/advance`, driverToken, { step: 'pretrip' });
  await call('POST', `/jobs/${id}/evidence/pickup/0`, driverToken, { key: `jobs/${id}/evidence/pickup/0/0.jpg` });
  await call('POST', `/jobs/${id}/evidence/pickup/1`, driverToken, { key: `jobs/${id}/evidence/pickup/1/1.jpg` });
  await call('POST', `/jobs/${id}/seal-number`, driverToken, { sealNo: 'SL-1' });
  await call('POST', `/jobs/${id}/advance`, driverToken, { step: 'pickup' });
  for (let s = 0; s < 3; s++) {
    await call('POST', `/jobs/${id}/evidence/load/${s}`, driverToken, { key: `jobs/${id}/evidence/load/${s}/lx${s}.jpg` });
  }
  await call('POST', `/jobs/${id}/advance`, driverToken, { step: 'load' });
  for (let s = 0; s < 4; s++) {
    await call('POST', `/jobs/${id}/evidence/delivery/${s}`, driverToken, {
      key: `jobs/${id}/evidence/delivery/${s}/dx${s}.jpg`,
    });
  }
  const r = await call('POST', `/jobs/${id}/submit`, driverToken);
  assert.equal(r.statusCode, 200, `submit failed: ${r.body}`);
};

await driveToSubmitted(jobId);

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

{
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

{
  const r = await call('PUT', `/jobs/${jobId}`, adminToken, newDraft({ price: 999 }));
  assert.equal(r.statusCode, 422);
  assert.match(r.json().message, /no longer be edited/i);
  const { rows } = await q<{ c: number }>(`SELECT price_cents c FROM jobs WHERE id = $1`, [
    jobId,
  ]);
  assert.equal(rows[0]!.c, 12000, 'the money that was accrued still matches the job');
}

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

  const edited = await call('PATCH', `/payroll/periods/${periodId}/line`, adminToken, {
    driverId: driver.id,
    jobId,
    legKind: 'pickup',
    amount: 999,
  });
  assert.equal(edited.statusCode, 422, 'a paid period cannot be edited');
  assert.match(edited.json().message, /already been paid/i);
}

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

  const victimToken = await login(driver.email);
  assert.equal((await call('GET', '/auth/me', victimToken)).statusCode, 200);
  const off = await call('POST', `/drivers/${driver.id}/deactivate`, adminToken);
  assert.equal(off.statusCode, 200, off.body);
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
{
  const jobId = (await call('GET', '/jobs', adminToken)).json().jobs[0].id as string;
  const { rows: [owner] } = await q<{ driver_id: string }>(
    `SELECT driver_id FROM jobs WHERE id = $1`,
    [jobId],
  );
  const driverId = owner!.driver_id;

  const first = await call('POST', '/chat/threads', adminToken, { driverId, jobId });
  assert.equal(first.statusCode, 201, first.body);
  const threadId = first.json().threadId as string;

  const second = await call('POST', '/chat/threads', adminToken, { driverId, jobId });
  assert.equal(second.json().threadId, threadId, 'starting a job chat is idempotent');

  const { rows: count } = await q<{ n: string }>(
    `SELECT count(*)::text n FROM threads WHERE job_id = $1`,
    [jobId],
  );
  assert.equal(count[0]!.n, '1', 'and leaves exactly one thread for that job');

  const sent = await call('POST', `/chat/threads/${threadId}/messages`, adminToken, {
    body: 'Confirming pickup window.',
  });
  assert.equal(sent.statusCode, 201, sent.body);

  const direct = await call('POST', '/chat/threads', adminToken, { driverId });
  assert.equal(direct.statusCode, 201, direct.body);
  const directId = direct.json().threadId as string;
  assert.notEqual(directId, threadId, 'a direct thread is not the job thread');

  const again = await call('POST', '/chat/threads', adminToken, { driverId });
  assert.equal(again.json().threadId, directId, 'and it is idempotent too');

  await call('POST', `/chat/threads/${directId}/messages`, adminToken, {
    body: 'Your licence expires next month.',
  });
  const jobMsgs = (await call('GET', `/chat/threads/${threadId}/messages`, adminToken))
    .json().messages as { body: string }[];
  assert.ok(
    jobMsgs.every(m => !m.body.includes('licence')),
    'the two threads do not share messages',
  );

  const { rows: [disp] } = await q<{ email: string; id: string }>(
    `SELECT email, id FROM users WHERE role = 'dispatcher' AND active LIMIT 1`,
  );
  const dispToken = await login(disp!.email);
  const viaDispatcher = await call('POST', '/chat/threads', dispToken, { driverId });
  assert.equal(viaDispatcher.json().threadId, directId, 'same direct thread for every office user');
  const dispThreads = (await call('GET', '/chat/threads', dispToken)).json().threads as { id: string }[];
  assert.ok(dispThreads.some(t => t.id === directId), 'it is in the dispatcher’s inbox');
  assert.equal(
    (await call('GET', `/chat/threads/${directId}/messages`, dispToken)).statusCode,
    200,
    'and the dispatcher can open it',
  );
  assert.equal(
    (await call('POST', `/chat/threads/${directId}/messages`, dispToken, { body: 'Following up.' }))
      .statusCode,
    201,
    'and answer it',
  );
  const { rows: [otherDriver] } = await q<{ email: string }>(
    `SELECT email FROM users WHERE role = 'driver' AND active AND id <> $1 LIMIT 1`,
    [driverId],
  );
  if (otherDriver) {
    const otherToken = await login(otherDriver.email);
    assert.equal(
      (await call('GET', `/chat/threads/${directId}/messages`, otherToken)).statusCode,
      404,
      'another driver cannot read it',
    );
  }

  const spare = await call('POST', '/drivers', adminToken, {
    name: 'No Jobs',
    email: `nojobs.${Date.now()}@a3transport.com`,
    phone: '555-0005',
    base: 'Houston',
    tempPassword: 'start1234',
  });
  const spareId = spare.json().driver.id as string;
  assert.equal(
    (await call('POST', '/chat/threads', adminToken, { driverId: spareId })).statusCode,
    201,
  );
  const wrongJob = await call('POST', '/chat/threads', adminToken, {
    driverId: spareId,
    jobId,
  });
  assert.equal(wrongJob.statusCode, 404, wrongJob.body);

  const { rows: [mine] } = await q<{ id: string }>(
    `SELECT j.id FROM jobs j
      WHERE j.driver_id = $1 AND NOT EXISTS (
        SELECT 1 FROM threads t WHERE t.job_id = j.id)
      LIMIT 1`,
    [driver.id],
  );
  const driverToken = await login(driver.email);
  if (mine) {
    const opened = await call('POST', '/chat/threads', driverToken, { jobId: mine.id });
    assert.equal(opened.statusCode, 201, opened.body);
    assert.equal(
      (await call('POST', '/chat/threads', driverToken, { jobId: mine.id })).json().threadId,
      opened.json().threadId,
      'idempotent for the driver too',
    );
  }

  const { rows: [foreign] } = await q<{ id: string }>(
    `SELECT id FROM jobs WHERE driver_id IS DISTINCT FROM $1 LIMIT 1`,
    [driver.id],
  );
  if (foreign) {
    assert.equal(
      (await call('POST', '/chat/threads', driverToken, { jobId: foreign.id })).statusCode,
      404,
      'a driver cannot open a thread on a job that is not theirs',
    );
  }
  const impersonated = await call('POST', '/chat/threads', driverToken, { driverId });
  assert.equal(impersonated.statusCode, 201);
  const { rows: [who] } = await q<{ driver_id: string }>(
    `SELECT driver_id FROM threads WHERE id = $1`,
    [impersonated.json().threadId],
  );
  assert.equal(who!.driver_id, driver.id, 'driverId in the body is ignored for a driver');
}

{
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

  const moved = await call('PUT', `/jobs/${jobId}`, adminToken, {
    ...newDraft({ title: 'Assigned by its legs', driverId: null }),
    legs: legsFor(otherId),
    price: 90,
  });
  assert.equal(moved.statusCode, 200, moved.body);
  assert.equal(moved.json().job.driverId, otherId, 'and reassigned by them too');

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

{
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

{
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

{
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

{
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

  const noPw = await call('POST', '/drivers', adminToken, {
    name: 'Invite Only',
    email: `invite.${Date.now()}@a3transport.com`,
    phone: '555-0002',
    base: 'Houston',
  });
  assert.equal(noPw.statusCode, 201, noPw.body);
  assert.equal(noPw.json().driver.active, true, 'status defaults to active');

  const inactive = await call('POST', '/drivers', adminToken, {
    name: 'Starts Inactive',
    email: `inactive.${Date.now()}@a3transport.com`,
    phone: '555-0003',
    base: 'Houston',
    tempPassword: 'a3transport',
    active: false,
  });
  assert.equal(inactive.statusCode, 201, inactive.body);
  assert.equal(inactive.json().driver.active, false);
  const { rows: [stored] } = await q<{ active: boolean }>(
    `SELECT active FROM users WHERE id = $1`,
    [inactive.json().driver.id],
  );
  assert.equal(stored!.active, false, 'the row, not just the response, is inactive');
}

{
  const url = `/customers/${custRow!.id}`;
  const set = await call('PATCH', url, adminToken, { ccEmails: ['Ops@Example.com', 'ops@example.com'] });
  assert.equal(set.statusCode, 200, set.body);
  assert.deepEqual(set.json().customer.ccEmails, ['ops@example.com'], 'lower-cased and de-duplicated');

  const other = await call('PATCH', url, adminToken, { phone: '555-0100' });
  assert.deepEqual(other.json().customer.ccEmails, ['ops@example.com'], 'an unrelated edit keeps the list');

  assert.equal((await call('PATCH', url, adminToken, { ccEmails: ['not-an-email'] })).statusCode, 400);

  const cleared = await call('PATCH', url, adminToken, { ccEmails: [] });
  assert.deepEqual(cleared.json().customer.ccEmails, []);
}

{
  const made = await call('POST', '/drivers', adminToken, {
    name: 'Typo Driverr', email: `typo.${Date.now()}@a3transport.com`,
    phone: '555-0101', base: 'Houston', tempPassword: 'start1234',
  });
  const id = made.json().driver.id as string;

  const edited = await call('PATCH', `/drivers/${id}`, adminToken, { name: 'Fixed Name', base: 'Katy' });
  assert.equal(edited.statusCode, 200, edited.body);
  assert.equal(edited.json().driver.name, 'Fixed Name');
  assert.equal(edited.json().driver.initials, 'FN', 'initials follow the name');
  assert.equal(
    (await call('PATCH', `/drivers/${id}`, adminToken, { email: driver.email })).statusCode,
    409,
    'cannot take another user’s email',
  );

  await call('POST', '/chat/threads', adminToken, { driverId: id });
  assert.equal((await call('DELETE', `/drivers/${id}`, adminToken)).statusCode, 204);
  assert.equal((await call('DELETE', `/drivers/${id}`, adminToken)).statusCode, 404);

  const busy = await call('DELETE', `/drivers/${driver.id}`, adminToken);
  assert.equal(busy.statusCode, 409, busy.body);
  assert.match(busy.json().message ?? busy.body, /Deactivate/);

  const cust = await call('POST', '/customers', adminToken, {
    name: 'Duplicate Co', email: `dup.${Date.now()}@example.com`,
  });
  assert.equal(cust.statusCode, 201, cust.body);
  assert.equal((await call('DELETE', `/customers/${cust.json().customer.id}`, adminToken)).statusCode, 204);
  assert.equal((await call('DELETE', `/customers/${custRow!.id}`, adminToken)).statusCode, 409, 'a customer with jobs stays');
}

{
  const pinned = await call('POST', '/jobs', adminToken, newDraft({ mapQuery: '29.7604,-95.3698' }));
  assert.equal(pinned.statusCode, 201, pinned.body);
  assert.equal(pinned.json().job.mapQuery, '29.7604,-95.3698', 'the picked pin is stored');

  const id = pinned.json().job.id;
  const retyped = await call('PUT', `/jobs/${id}`, adminToken, newDraft({ mapQuery: null }));
  assert.equal(retyped.statusCode, 200, retyped.body);
  assert.equal(retyped.json().job.mapQuery, null, 'a retyped address drops the old pin');

  assert.equal(
    (await call('POST', '/jobs', adminToken, newDraft({ mapQuery: 'javascript:alert(1)' }))).statusCode,
    400,
    'only "lat,lng" is accepted',
  );

  delete process.env.GOOGLE_MAPS_API_KEY;
  assert.equal((await call('GET', '/places/autocomplete?q=Katy', adminToken)).statusCode, 501);
}

{
  await q(`UPDATE users SET active = true WHERE role = 'driver'`);
  const { rows: [other] } = await q<{ id: string; email: string }>(
    `SELECT id, email FROM users WHERE role = 'driver' AND id <> $1 ORDER BY id LIMIT 1`,
    [driver.id],
  );
  const aTok = await login(driver.email);
  const bTok = await login(other!.email);
  const r = await call('POST', '/jobs', adminToken, newDraft({
    legs: [
      { kind: 'pickup', driverId: driver.id, amount: 40 },
      { kind: 'loading', driverId: other!.id, amount: 40 },
      { kind: 'delivery', driverId: other!.id, amount: 40 },
    ],
  }));
  assert.equal(r.statusCode, 201, r.body);
  const id = r.json().job.id;
  const ev = (tok: string, step: string) =>
    call('POST', `/jobs/${id}/evidence/${step}/0`, tok, { key: `jobs/${id}/evidence/${step}/0/x${step}.jpg` });

  assert.equal((await call('GET', `/jobs/${id}`, bTok)).statusCode, 200, 'the load driver sees the job');
  assert.equal((await call('POST', `/jobs/${id}/inspection/brakes`, bTok, { result: 'pass' })).statusCode, 403, 'pre-trip is the pickup driver’s');
  assert.equal((await call('POST', `/jobs/${id}/inspection/brakes`, aTok, { result: 'pass' })).statusCode, 200);
  assert.equal((await ev(bTok, 'pickup')).statusCode, 403);
  assert.equal((await ev(aTok, 'load')).statusCode, 403, 'the pickup driver cannot do load');
  assert.equal((await ev(aTok, 'delivery')).statusCode, 403, 'or delivery');
  assert.equal((await ev(bTok, 'load')).statusCode, 200, 'the load driver can');
  assert.equal((await call('POST', `/jobs/${id}/submit`, aTok, {})).statusCode, 403, 'nor submit');
  assert.equal(
    (await call('POST', '/uploads/presign', bTok, {
      purpose: 'evidence', jobId: id, step: 'load', slot: 0, contentType: 'image/jpeg', contentLength: 1000,
    })).statusCode,
    200,
    'a leg driver may upload to the job',
  );

  const h = await call('POST', '/jobs', adminToken, newDraft({
    driverId: null,
    legs: [
      { kind: 'pickup', driverId: driver.id, amount: 40 },
      { kind: 'loading', driverId: other!.id, amount: 40 },
      { kind: 'delivery', driverId: other!.id, amount: 40 },
    ],
  }));
  assert.equal(h.statusCode, 201, h.body);
  const hid = h.json().job.id;
  const ok = async (tok: string, method: string, path: string, body?: object) => {
    const res = await call(method, path, tok, body);
    assert.ok(res.statusCode < 300, `${method} ${path}: ${res.statusCode} ${res.body}`);
    return res;
  };
  for (const item of INSPECTION_ITEMS) await ok(aTok, 'POST', `/jobs/${hid}/inspection/${item.id}`, { result: 'pass' });
  await ok(aTok, 'POST', `/jobs/${hid}/advance`, { step: 'pretrip' });
  const pickupSlots = (await ok(aTok, 'GET', `/jobs/${hid}`)).json().job.evidence.pickup.length;
  for (let s = 0; s < pickupSlots; s++) await ok(aTok, 'POST', `/jobs/${hid}/evidence/pickup/${s}`, { key: `jobs/${hid}/evidence/pickup/${s}/p${s}.jpg` });
  await ok(aTok, 'POST', `/jobs/${hid}/seal-number`, { sealNo: 'SL-9' });
  await ok(aTok, 'POST', `/jobs/${hid}/advance`, { step: 'pickup' });
  const slots = (await ok(bTok, 'GET', `/jobs/${hid}`)).json().job.evidence;
  for (let s = 0; s < slots.load.length; s++) {
    const pre = await ok(bTok, 'POST', '/uploads/presign', {
      purpose: 'evidence', jobId: hid, step: 'load', slot: s, contentType: 'image/jpeg', contentLength: 1000,
    });
    await ok(bTok, 'POST', `/jobs/${hid}/evidence/load/${s}`, { key: pre.json().key });
  }
  await ok(bTok, 'POST', `/jobs/${hid}/advance`, { step: 'load' });
  for (let s = 0; s < slots.delivery.length; s++) {
    const pre = await ok(bTok, 'POST', '/uploads/presign', {
      purpose: 'evidence', jobId: hid, step: 'delivery', slot: s, contentType: 'image/jpeg', contentLength: 1000,
    });
    await ok(bTok, 'POST', `/jobs/${hid}/evidence/delivery/${s}`, { key: pre.json().key });
  }
  await ok(bTok, 'POST', `/jobs/${hid}/submit`, {});

  const tA = await call('POST', '/chat/threads', aTok, { jobId: id });
  const tB = await call('POST', '/chat/threads', bTok, { jobId: id });
  assert.equal(tB.statusCode, 201, tB.body);
  assert.equal(tB.json().threadId, tA.json().threadId, 'both drivers land in the same thread');
  const thr = tA.json().threadId;
  assert.equal((await call('POST', `/chat/threads/${thr}/messages`, aTok, { body: 'at the gate' })).statusCode, 201);
  const seen = await call('GET', `/chat/threads/${thr}/messages`, bTok);
  assert.equal(seen.statusCode, 200, seen.body);
  assert.equal(seen.json().messages.at(-1).body, 'at the gate', 'the load driver reads it');
  assert.equal((await call('POST', `/chat/threads/${thr}/messages`, adminToken, { body: 'ok' })).statusCode, 201);
  const { rows: told } = await q<{ user_id: string }>(
    `SELECT user_id FROM notifications WHERE thread_id = $1 AND body = 'ok'`, [thr],
  );
  assert.deepEqual(told.map(t => t.user_id).sort(), [driver.id, other!.id].sort(), 'the office reply reaches both');

  const { rows: [third] } = await q<{ email: string }>(
    `SELECT email FROM users WHERE role = 'driver' AND id NOT IN ($1,$2)
       AND password_hash = (SELECT password_hash FROM users WHERE id = $1) LIMIT 1`, [driver.id, other!.id],
  );
  if (third) {
    const cTok = await login(third.email);
    assert.equal((await call('GET', `/chat/threads/${thr}/messages`, cTok)).statusCode, 404, 'a driver not on the job is out');
  }
}

await app.close();
await pool.end();
console.log('admin: money paths hold — approve pays once, paid periods are immutable');
void tx;
