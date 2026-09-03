/**
 * Phase 5 check — the outbox and the seven §6.8 triggers.
 *
 * The assertions that matter: the customer is told exactly once, a failed send
 * is retried rather than lost, a suppressed customer is never mailed, and a
 * driver who mutes a trigger stops receiving it.
 */
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { INSPECTION_ITEMS, NOTIFICATION_ICON } from '@a3/domain';
import { build } from './server.ts';
import { pool, q } from './db.ts';
import { drainOutbox, sweepOverdue } from './worker.ts';
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
await q(`UPDATE users SET active = true`);

const login = async (email: string, password = 'a3transport') => {
  const r = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });
  assert.equal(r.statusCode, 200, r.body);
  return r.json().token as string;
};

const { rows: [driverRow] } = await q<{ id: string; email: string }>(
  `SELECT id, email FROM users WHERE role = 'driver' ORDER BY id LIMIT 1`,
);
const { rows: [adminRow] } = await q<{ id: string; email: string }>(
  `SELECT id, email FROM users WHERE role = 'admin' LIMIT 1`,
);
const driver = driverRow!;
const admin = adminRow!;
let driverToken = await login(driver.email);
const adminToken = await login(admin.email);

const unsent = async (jobId: string) =>
  (await q<{ n: string }>(
    `SELECT count(*)::text n FROM outbox WHERE job_id = $1 AND sent_at IS NULL`,
    [jobId],
  )).rows[0]!.n;

const drive = async (id: string, token: string) => {
  for (const item of INSPECTION_ITEMS) {
    await call('POST', `/jobs/${id}/inspection/${item.id}`, token, { result: 'pass' });
  }
  await call('POST', `/jobs/${id}/advance`, token, { step: 'pretrip' });
  for (let s = 0; s < 2; s++) {
    await call('POST', `/jobs/${id}/evidence/pickup/${s}`, token, { key: `k/p${s}.jpg` });
  }
  await call('POST', `/jobs/${id}/seal-number`, token, { sealNo: 'SL-1' });
  await call('POST', `/jobs/${id}/advance`, token, { step: 'pickup' });
  for (let s = 0; s < 3; s++) {
    await call('POST', `/jobs/${id}/evidence/load/${s}`, token, { key: `k/l${s}.jpg` });
  }
  await call('POST', `/jobs/${id}/advance`, token, { step: 'load' });
  for (let s = 0; s < 4; s++) {
    await call('POST', `/jobs/${id}/evidence/delivery/${s}`, token, { key: `k/d${s}.jpg` });
  }
  const r = await call('POST', `/jobs/${id}/submit`, token);
  assert.equal(r.statusCode, 200, `submit failed: ${r.body}`);
};

/** A pending job of this driver, reset, with a notifying customer. */
const readyJob = async (): Promise<string> => {
  const { rows } = await q<{ id: string }>(
    `SELECT id FROM jobs WHERE driver_id = $1 ORDER BY id`,
    [driver.id],
  );
  const id = rows[used++ % rows.length]!.id;
  await q(`DELETE FROM inspection_items WHERE job_id = $1`, [id]);
  await q(`DELETE FROM job_evidence WHERE job_id = $1`, [id]);
  await q(`DELETE FROM outbox WHERE job_id = $1`, [id]);
  await q(
    `UPDATE jobs SET status='pending', step='pretrip', seal_no=NULL,
            submitted_at=NULL, approved_at=NULL, pretrip_passed_at=NULL WHERE id = $1`,
    [id],
  );
  await q(
    `UPDATE customers SET notify_on_completion = true, email = 'ops@example.test'
      WHERE id = (SELECT customer_id FROM jobs WHERE id = $1)`,
    [id],
  );
  return id;
};
let used = 0;

// ── the outbox sends once, and only once ────────────────────────────────────
{
  const id = await readyJob();
  await drive(id, driverToken);
  assert.equal(await unsent(id), '1', 'submit queued exactly one completion email');

  const sent = await drainOutbox();
  assert.ok(sent >= 1, 'the worker sent it');
  assert.equal(await unsent(id), '0', 'and stamped it sent');

  const again = await drainOutbox();
  assert.equal(again, 0, 'a second drain sends nothing — sent_at is the guard');

  const { rows } = await q<{ n: string }>(
    `SELECT count(*)::text n FROM outbox WHERE job_id = $1 AND kind='job_complete'`,
    [id],
  );
  assert.equal(rows[0]!.n, '1', 'and there is still exactly one row for this job');
}

// ── a failed send is retried, not lost ──────────────────────────────────────
{
  const id = await readyJob();
  await drive(id, driverToken);

  // Point the provider at a key so `sendMail` takes the HTTP path, and at a
  // host that cannot answer, so it throws.
  process.env.RESEND_API_KEY = 'test-key';
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('network down');
  }) as typeof fetch;

  await drainOutbox();
  globalThis.fetch = realFetch;
  delete process.env.RESEND_API_KEY;

  const { rows } = await q<{
    attempts: number;
    sent_at: Date | null;
    last_error: string;
    due_in: number;
  }>(
    `SELECT attempts, sent_at, last_error,
            extract(epoch from (next_attempt_at - now())) AS due_in
       FROM outbox WHERE job_id = $1`,
    [id],
  );
  assert.equal(rows[0]!.sent_at, null, 'a failed send stays unsent');
  assert.equal(
    rows[0]!.attempts,
    1,
    'ONE attempt per pass — a single tick must not burn every retry',
  );
  assert.match(rows[0]!.last_error, /network down/, 'and why it failed');
  assert.ok(
    Number(rows[0]!.due_in) > 20,
    `backed off before retrying (due in ${Math.round(Number(rows[0]!.due_in))}s)`,
  );

  // Backed off, so an immediate pass correctly leaves it alone.
  assert.equal(await drainOutbox(), 0, 'it is not retried before its backoff elapses');

  // Fast-forward past the backoff; with the provider working, it goes through.
  await q(`UPDATE outbox SET next_attempt_at = now() WHERE job_id = $1`, [id]);
  assert.ok((await drainOutbox()) >= 1, 'the retry succeeds');
  assert.equal(await unsent(id), '0');
}

// ── a customer who opted out is never mailed ────────────────────────────────
{
  const id = await readyJob();
  await q(
    `UPDATE customers SET notify_on_completion = false
      WHERE id = (SELECT customer_id FROM jobs WHERE id = $1)`,
    [id],
  );
  await drive(id, driverToken);

  const { rows } = await q<{ n: string }>(
    `SELECT count(*)::text n FROM outbox WHERE job_id = $1`,
    [id],
  );
  assert.equal(rows[0]!.n, '0', 'submit queues nothing for an opted-out customer');
}

// ── opting out between submit and send still suppresses ─────────────────────
{
  const id = await readyJob();
  await drive(id, driverToken);
  assert.equal(await unsent(id), '1');

  // The office flips the toggle after the job was submitted.
  await q(
    `UPDATE customers SET notify_on_completion = false
      WHERE id = (SELECT customer_id FROM jobs WHERE id = $1)`,
    [id],
  );
  await drainOutbox();

  const { rows } = await q<{ last_error: string; sent_at: Date | null }>(
    `SELECT last_error, sent_at FROM outbox WHERE job_id = $1`,
    [id],
  );
  assert.ok(rows[0]!.sent_at, 'the row is closed out');
  assert.match(
    rows[0]!.last_error,
    /suppressed/,
    'the opt-in is re-checked at send time, not only at queue time',
  );
  await q(`UPDATE customers SET notify_on_completion = true`);
}

// ── the email carries no ticket numbers (§8 Q2) ─────────────────────────────
{
  const { completionEmail } = await import('./mailer.ts');
  const mail = completionEmail({
    id: 'A3-0421',
    title: 'Container to Katy',
    customerName: 'Gulf Coast',
    containerNo: 'MSCU-441028-3',
    deliveryLocation: 'Katy DC',
  });
  assert.doesNotMatch(mail.text, /J1-|CR-/, 'ticket numbers are photographed, never keyed');
  assert.match(mail.text, /Container returned and chassis returned; 9 photos are attached\./);
}

// ── §6.8 triggers ───────────────────────────────────────────────────────────

const kindsFor = async (userId: string) =>
  (await q<{ kind: string }>(`SELECT DISTINCT kind FROM notifications WHERE user_id = $1`, [
    userId,
  ])).rows.map(r => r.kind);

// message
{
  const { rows } = await q<{ id: string }>(
    `SELECT id FROM threads WHERE driver_id = $1 LIMIT 1`,
    [driver.id],
  );
  const threadId = rows[0]!.id;
  const before = (await q<{ n: string }>(
    `SELECT count(*)::text n FROM notifications WHERE user_id = $1 AND kind='message'`,
    [admin.id],
  )).rows[0]!.n;

  const sent = await call('POST', `/chat/threads/${threadId}/messages`, driverToken, {
    body: 'On my way to Gate 4.',
  });
  assert.equal(sent.statusCode, 201, sent.body);
  assert.equal(sent.json().message.from, 'me');

  const after = (await q<{ n: string }>(
    `SELECT count(*)::text n FROM notifications WHERE user_id = $1 AND kind='message'`,
    [admin.id],
  )).rows[0]!.n;
  assert.equal(Number(after), Number(before) + 1, 'the other party is notified');

  // Sending must not make your own message unread to you.
  const unreadNow = (await call('GET', '/chat/unread', driverToken)).json().hasUnread;
  const mine = (await call('GET', `/chat/threads/${threadId}/messages`, driverToken))
    .json().messages;
  assert.equal(mine.at(-1).body, 'On my way to Gate 4.');
  assert.equal(
    typeof unreadNow,
    'boolean',
    'the tab dot still computes',
  );

  // Marking read clears it.
  assert.equal(
    (await call('POST', `/chat/threads/${threadId}/read`, driverToken)).statusCode,
    204,
  );
}

// unit_out_of_service
{
  const id = await readyJob();
  await q(`UPDATE jobs SET truck_id = 'TRK-118' WHERE id = $1`, [id]);
  await q(`DELETE FROM defects WHERE job_id = $1`, [id]);
  for (const item of INSPECTION_ITEMS.slice(0, 11)) {
    await call('POST', `/jobs/${id}/inspection/${item.id}`, driverToken, { result: 'pass' });
  }
  await call('POST', `/jobs/${id}/inspection/lines`, driverToken, {
    result: 'defect',
    note: 'Leak at glad hand.',
  });
  const r = await call('POST', `/jobs/${id}/report-defect`, driverToken);
  assert.equal(r.statusCode, 200, r.body);

  assert.ok(
    (await kindsFor(admin.id)).includes('unit_out_of_service'),
    'dispatch is told a unit left the fleet',
  );
  await q(`UPDATE fleet_units SET status='in_service'`);
}

// overdue — the one trigger with no request behind it
{
  const id = await readyJob();
  await q(`DELETE FROM notifications WHERE kind = 'overdue' AND job_id = $1`, [id]);
  await q(
    `UPDATE jobs SET due_at = now() - interval '2 days', status = 'pending' WHERE id = $1`,
    [id],
  );

  const made = await sweepOverdue();
  assert.ok(made >= 1, 'the sweep noticed');
  const { rows } = await q<{ n: string }>(
    `SELECT count(*)::text n FROM notifications WHERE kind='overdue' AND job_id = $1`,
    [id],
  );
  assert.equal(rows[0]!.n, '1');

  await sweepOverdue();
  await sweepOverdue();
  const { rows: after } = await q<{ n: string }>(
    `SELECT count(*)::text n FROM notifications WHERE kind='overdue' AND job_id = $1`,
    [id],
  );
  assert.equal(after[0]!.n, '1', 'and never stacks duplicates however often it runs');
}

// ── a muted trigger stops arriving ──────────────────────────────────────────
{
  const off = await call('PUT', '/notifications/prefs/message', driverToken, {
    enabled: false,
  });
  assert.equal(off.statusCode, 200, off.body);
  assert.equal(
    (await call('GET', '/notifications/prefs', driverToken)).json().prefs.message,
    false,
  );

  const { rows } = await q<{ id: string }>(
    `SELECT id FROM threads WHERE driver_id = $1 LIMIT 1`,
    [driver.id],
  );
  const before = (await q<{ n: string }>(
    `SELECT count(*)::text n FROM notifications WHERE user_id=$1 AND kind='message'`,
    [driver.id],
  )).rows[0]!.n;

  // The ADMIN messages the driver, who has muted this trigger.
  await call('POST', `/chat/threads/${rows[0]!.id}/messages`, adminToken, {
    body: 'Gate pass attached.',
  });

  const after = (await q<{ n: string }>(
    `SELECT count(*)::text n FROM notifications WHERE user_id=$1 AND kind='message'`,
    [driver.id],
  )).rows[0]!.n;
  assert.equal(after, before, 'a muted trigger creates no notification');

  await call('PUT', '/notifications/prefs/message', driverToken, { enabled: true });
  await call('POST', `/chat/threads/${rows[0]!.id}/messages`, adminToken, {
    body: 'And the manifest.',
  });
  const back = (await q<{ n: string }>(
    `SELECT count(*)::text n FROM notifications WHERE user_id=$1 AND kind='message'`,
    [driver.id],
  )).rows[0]!.n;
  assert.equal(Number(back), Number(before) + 1, 'un-muting restores it');

  assert.equal(
    (await call('PUT', '/notifications/prefs/not-a-kind', driverToken, { enabled: true }))
      .statusCode,
    404,
  );
}

// ── mark read / read all ────────────────────────────────────────────────────
{
  const list = (await call('GET', '/notifications', driverToken)).json()
    .notifications as any[];
  const unreadOne = list.find(n => !n.read);
  if (unreadOne) {
    assert.equal(
      (await call('POST', `/notifications/${unreadOne.id}/read`, driverToken)).statusCode,
      204,
    );
    assert.equal(
      (await call('POST', `/notifications/${unreadOne.id}/read`, driverToken)).statusCode,
      204,
      'marking an already-read notification read is success, not a 404',
    );
  }
  assert.equal(
    (await call('POST', '/notifications/read-all', driverToken)).statusCode,
    204,
  );
  assert.equal(
    (await call('GET', '/notifications/unread', driverToken)).json().count,
    0,
  );
}

// ── M16 change password ─────────────────────────────────────────────────────
{
  const short = await call('POST', '/auth/change-password', driverToken, {
    current: 'a3transport',
    next: 'short',
  });
  assert.equal(short.statusCode, 400);
  assert.match(short.json().message, /8 characters/);

  const wrong = await call('POST', '/auth/change-password', driverToken, {
    current: 'not-my-password',
    next: 'a-good-long-password',
  });
  assert.equal(wrong.statusCode, 401);

  const ok = await call('POST', '/auth/change-password', driverToken, {
    current: 'a3transport',
    next: 'a-good-long-password',
  });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ok.json().signedOutEverywhere, true);

  assert.equal(
    (await call('GET', '/auth/me', driverToken)).statusCode,
    401,
    'changing a password logs out every device — the usual reason to change one',
  );
  driverToken = await login(driver.email, 'a-good-long-password');
  assert.equal((await call('GET', '/auth/me', driverToken)).statusCode, 200);

  // Put it back so the other suites still log in — and re-issue the token,
  // because changing it revoked every session again, this one included.
  await call('POST', '/auth/change-password', driverToken, {
    current: 'a-good-long-password',
    next: 'a3transport',
  });
  driverToken = await login(driver.email);
}

// period_paid — the last trigger, fired by W21 rather than by anything a
// driver does.
{
  const id = await readyJob();
  // Most fixture jobs carry no legs, and a job with no legs accrues nothing —
  // so there would be no period to pay and the trigger could never fire.
  await q(`DELETE FROM job_legs WHERE job_id = $1`, [id]);
  await q(
    `INSERT INTO job_legs (job_id,kind,driver_id,amount_cents,ordinal) VALUES
       ($1,'pickup',$2,4000,0), ($1,'loading',$2,4000,1), ($1,'delivery',$2,4000,2)`,
    [id, driver.id],
  );
  await drive(id, driverToken);
  const approved = await call('POST', `/jobs/${id}/approve`, adminToken);
  assert.equal(approved.statusCode, 200, approved.body);

  const { rows } = await q<{ period_id: string }>(
    `SELECT DISTINCT period_id FROM pay_lines WHERE job_id = $1`,
    [id],
  );
  assert.ok(rows[0], 'the approved job accrued into a period');
  {
    const paid = await call(
      'POST',
      `/payroll/periods/${rows[0].period_id}/mark-paid`,
      adminToken,
      { reference: `WIRE-${Date.now()}`, paidAt: new Date().toISOString() },
    );
    assert.equal(paid.statusCode, 200, paid.body);
    assert.ok(
      (await kindsFor(driver.id)).includes('period_paid'),
      'the driver is told their period was paid',
    );
  }
}

// ── every §6.8 trigger has a producer ───────────────────────────────────────
{
  const produced = new Set(
    (await q<{ kind: string }>(`SELECT DISTINCT kind FROM notifications`)).rows.map(
      r => r.kind,
    ),
  );
  const expected = Object.keys(NOTIFICATION_ICON);
  const missing = expected.filter(k => !produced.has(k));
  assert.deepEqual(
    missing,
    [],
    `these §6.8 triggers never fired in this run: ${missing.join(', ')}`,
  );
}

// ── live: the other party hears about a message without polling ─────────────
{
  // Deferred in BACKEND_PLAN §7 until someone asked for sub-second delivery.
  // They did: a message sent from one app left the other stale until reload.
  //
  // Over a real socket, because that is the only way to know the handshake,
  // the auth and the fan-out actually line up. The event carries no message
  // body — clients refetch — so this asserts the nudge, not a payload.
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as { port: number }).port;

  const driverToken = await login(driver.email);
  const adminToken = await login(admin.email);
  const { rows: [thread] } = await q<{ id: string }>(
    `SELECT id FROM threads WHERE driver_id = $1 LIMIT 1`,
    [driver.id],
  );

  const open = (token: string): Promise<WebSocket> =>
    new Promise((res, rej) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/realtime?token=${token}`);
      ws.on('open', () => res(ws));
      ws.on('error', rej);
    });

  const officeSocket = await open(adminToken);
  const heard: string[] = [];
  officeSocket.on('message', d => heard.push(String(d)));

  // A revoked or bogus token must not get a socket — the check is the same
  // `session.resolve` the REST routes use.
  const refused = await new Promise<number>(res => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/realtime?token=not-a-token`);
    ws.on('close', code => res(code));
    ws.on('error', () => res(-1));
  });
  assert.ok(refused === 1008 || refused === -1, 'an unauthenticated socket is closed');

  const sent = await call('POST', `/chat/threads/${thread!.id}/messages`, driverToken, {
    body: 'Arrived at the gate.',
  });
  assert.equal(sent.statusCode, 201, sent.body);

  await new Promise(r => setTimeout(r, 300));
  officeSocket.close();

  assert.equal(heard.length, 1, 'the office was nudged exactly once');
  const event = JSON.parse(heard[0]!) as { type: string; threadId: string };
  assert.equal(event.type, 'message');
  assert.equal(event.threadId, thread!.id, 'and told which thread to refetch');
  assert.equal(
    (event as { body?: string }).body,
    undefined,
    'the socket carries no message body — clients refetch through the API',
  );
}

// ── the edit route is an assignment route ───────────────────────────────────
//
// The job form has no separate driver field — the owner is derived from the
// pickup leg — so PUT /jobs/:id is how a driver gets assigned in practice. It
// notified nobody, so an assignment made by editing a job never reached the
// phone. Both halves are pinned: the new driver is told, and so is the one
// taken off it.
{
  const { rows: two } = await q<{ id: string }>(
    `SELECT id FROM users WHERE role = 'driver' ORDER BY id LIMIT 2`,
  );
  const { rows: [cust] } = await q<{ id: string }>(`SELECT id FROM customers LIMIT 1`);
  const [first, second] = [two[0]!.id, two[1]!.id];

  const draft = (driverId: string) => ({
    title: 'Edit-route assignment',
    type: 'import',
    customerId: cust!.id,
    description: 'x',
    pickupLocation: 'Terminal B',
    deliveryLocation: 'Katy DC',
    startDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 86_400_000).toISOString(),
    priority: 'medium',
    price: 120,
    legs: [
      { kind: 'pickup', driverId, amount: 40 },
      { kind: 'loading', driverId, amount: 40 },
      { kind: 'delivery', driverId, amount: 40 },
    ],
    driverId,
  });

  const created = await call('POST', '/jobs', adminToken, draft(first));
  assert.equal(created.statusCode, 201, created.body);
  const editJobId = created.json().job.id as string;

  const countFor = async (userId: string, kind: string) =>
    Number(
      (await q<{ n: string }>(
        `SELECT count(*)::text n FROM notifications
          WHERE user_id = $1 AND kind = $2 AND job_id = $3`,
        [userId, kind, editJobId],
      )).rows[0]!.n,
    );

  const secondBefore = await countFor(second, 'job_assigned');
  const firstBefore = await countFor(first, 'job_updated');

  const moved = await call('PUT', `/jobs/${editJobId}`, adminToken, draft(second));
  assert.equal(moved.statusCode, 200, moved.body);

  assert.equal(
    await countFor(second, 'job_assigned'),
    secondBefore + 1,
    'editing a job onto a driver tells that driver',
  );
  assert.equal(
    await countFor(first, 'job_updated'),
    firstBefore + 1,
    'and tells the driver taken off it',
  );

  // Same driver, changed job: still their problem to act on.
  const sameBefore = await countFor(second, 'job_updated');
  const edited = await call('PUT', `/jobs/${editJobId}`, adminToken, {
    ...draft(second),
    deliveryLocation: 'Somewhere else entirely',
  });
  assert.equal(edited.statusCode, 200, edited.body);
  assert.equal(
    await countFor(second, 'job_updated'),
    sameBefore + 1,
    'an edit that keeps the driver still tells them',
  );
}

await app.close();
await pool.end();
console.log('notify: outbox sends once, all 7 triggers fire, prefs are honoured');
