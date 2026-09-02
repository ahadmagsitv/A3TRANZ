/**
 * Phase 3 check. Drives one job end to end through the real HTTP surface, then
 * tries to cheat every gate.
 *
 * The point of Phase 3 is that the gates stopped being UX. So the assertions
 * that matter are the refusals: a submit with a missing photo, a step taken out
 * of order, a defect with no note, a driver reaching for 'done'.
 */
import assert from 'node:assert/strict';
import { INSPECTION_ITEMS, TOTAL_REQUIRED_PHOTOS } from '@a3/domain';
import { build } from './server.ts';
import { pool, q, tx } from './db.ts';
import { reseed } from './testdb.ts';
import { spawnSync } from 'node:child_process';

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
const login = async (email: string) => {
  const r = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password: 'a3transport' },
  });
  assert.equal(r.statusCode, 200, r.body);
  return r.json().token as string;
};

const { rows: [driverRow] } = await q<{ id: string; email: string }>(
  `SELECT id, email FROM users WHERE role = 'driver' ORDER BY id LIMIT 1`,
);
const { rows: [adminRow] } = await q<{ email: string }>(
  `SELECT email FROM users WHERE role = 'admin' LIMIT 1`,
);
const driver = driverRow!;
const token = await login(driver.email);
const adminToken = await login(adminRow!.email);

/**
 * A clean job belonging to this driver, reset to PENDING.
 *
 * Each scenario takes a DIFFERENT job: several of them end with the job
 * blocked or awaiting approval, so reusing one would either run out of pending
 * jobs or quietly clobber a job a later assertion still depends on.
 */
const { rows: driverJobs } = await q<{ id: string }>(
  `SELECT id FROM jobs WHERE driver_id = $1 ORDER BY id`,
  [driver.id],
);
assert.ok(driverJobs.length >= 8, `need >=8 jobs to test with, have ${driverJobs.length}`);

let nextJob = 0;
const freshJob = async (): Promise<string> => {
  const id = driverJobs[nextJob++ % driverJobs.length]!.id;
  await tx(async c => {
    await c.query(`DELETE FROM inspection_items WHERE job_id = $1`, [id]);
    await c.query(`DELETE FROM job_evidence WHERE job_id = $1`, [id]);
    await c.query(`DELETE FROM defects WHERE job_id = $1`, [id]);
    await c.query(`DELETE FROM outbox WHERE job_id = $1`, [id]);
    await c.query(
      `UPDATE jobs SET status='pending', step='pretrip', seal_no=NULL,
              submitted_at=NULL, approved_at=NULL, pretrip_passed_at=NULL
        WHERE id = $1`,
      [id],
    );
    await c.query(`UPDATE fleet_units SET status='in_service' WHERE status='out_of_service'`);
  });
  return id;
};

const get = async (id: string) => (await call('GET', `/jobs/${id}`, token)).json().job;

// ── ① a defect with no note is refused at the boundary ──────────────────────
{
  const id = await freshJob();
  const r = await call('POST', `/jobs/${id}/inspection/tires`, token, {
    result: 'defect',
    note: '   ',
  });
  assert.equal(r.statusCode, 422, r.body);
  assert.match(r.json().message, /note/i, 'the gate explains itself in its own words');

  const { rows } = await q(`SELECT 1 FROM inspection_items WHERE job_id = $1`, [id]);
  assert.equal(rows.length, 0, 'and nothing was written');
}

// ── the job cannot start before the checklist clears ────────────────────────
{
  const id = await freshJob();
  assert.equal(
    (await call('POST', `/jobs/${id}/advance`, token, { step: 'pretrip' })).statusCode,
    422,
    'a blank checklist does not advance',
  );

  // Eleven of twelve is still not twelve.
  for (const item of INSPECTION_ITEMS.slice(0, 11)) {
    const r = await call('POST', `/jobs/${id}/inspection/${item.id}`, token, {
      result: 'pass',
    });
    assert.equal(r.statusCode, 200, r.body);
  }
  const at11 = await call('POST', `/jobs/${id}/advance`, token, { step: 'pretrip' });
  assert.equal(at11.statusCode, 422, '11/12 does not start a job');
  assert.match(at11.json().message, /Complete all 12/i);

  const last = INSPECTION_ITEMS[11]!;
  const done = await call('POST', `/jobs/${id}/inspection/${last.id}`, token, {
    result: 'pass',
  });
  assert.equal(done.json().gate.satisfied, true, '12/12 unlocks');
  assert.ok(done.json().job.inspection.passedAt, 'and stamps when it cleared');

  const started = await call('POST', `/jobs/${id}/advance`, token, { step: 'pretrip' });
  assert.equal(started.statusCode, 200);
  assert.equal(started.json().job.step, 'pickup');
  assert.equal(started.json().job.status, 'in_progress');
}

// ── ② two photos alone do NOT confirm pickup (Q1) ───────────────────────────
{
  const id = await freshJob();
  for (const item of INSPECTION_ITEMS) {
    await call('POST', `/jobs/${id}/inspection/${item.id}`, token, { result: 'pass' });
  }
  await call('POST', `/jobs/${id}/advance`, token, { step: 'pretrip' });

  await call('POST', `/jobs/${id}/evidence/pickup/0`, token, { key: 'k/p0.jpg' });
  const two = await call('POST', `/jobs/${id}/evidence/pickup/1`, token, {
    key: 'k/p1.jpg',
  });
  assert.equal(two.json().gate.satisfied, false, 'both photos in, still locked');
  assert.match(two.json().gate.lockCopy, /seal number/i);

  assert.equal(
    (await call('POST', `/jobs/${id}/advance`, token, { step: 'pickup' })).statusCode,
    422,
    'and advancing is refused, not merely discouraged',
  );

  // Whitespace is not a seal number.
  assert.equal(
    (await call('POST', `/jobs/${id}/seal-number`, token, { sealNo: '   ' })).statusCode,
    422,
  );

  const sealed = await call('POST', `/jobs/${id}/seal-number`, token, {
    sealNo: 'SL-99120',
  });
  assert.equal(sealed.json().gate.satisfied, true, 'photos + seal unlocks');
  assert.equal(
    (await call('POST', `/jobs/${id}/advance`, token, { step: 'pickup' })).json().job.step,
    'load',
  );
}

// ── steps cannot be taken out of order ──────────────────────────────────────
{
  const id = await freshJob();
  const r = await call('POST', `/jobs/${id}/advance`, token, { step: 'delivery' });
  assert.equal(r.statusCode, 422);
  assert.match(r.json().message, /out of order/i);
}

// ── full run, then the cheats ───────────────────────────────────────────────
let submittedId = '';
{
  const id = await freshJob();
  submittedId = id;

  for (const item of INSPECTION_ITEMS) {
    await call('POST', `/jobs/${id}/inspection/${item.id}`, token, { result: 'pass' });
  }
  await call('POST', `/jobs/${id}/advance`, token, { step: 'pretrip' });

  await call('POST', `/jobs/${id}/evidence/pickup/0`, token, { key: 'k/p0.jpg' });
  await call('POST', `/jobs/${id}/evidence/pickup/1`, token, { key: 'k/p1.jpg' });
  await call('POST', `/jobs/${id}/seal-number`, token, { sealNo: 'SL-99120' });
  await call('POST', `/jobs/${id}/advance`, token, { step: 'pickup' });

  for (let s = 0; s < 3; s++) {
    await call('POST', `/jobs/${id}/evidence/load/${s}`, token, { key: `k/l${s}.jpg` });
  }
  await call('POST', `/jobs/${id}/advance`, token, { step: 'load' });

  // Three of four on delivery — submit must refuse.
  for (let s = 0; s < 3; s++) {
    await call('POST', `/jobs/${id}/evidence/delivery/${s}`, token, {
      key: `k/d${s}.jpg`,
    });
  }
  const short = await call('POST', `/jobs/${id}/submit`, token);
  assert.equal(short.statusCode, 422, 'eight of nine is not nine');
  assert.equal(
    (await get(id)).status,
    'in_progress',
    'and the refused submit changed nothing',
  );
  assert.equal(
    (await q(`SELECT 1 FROM outbox WHERE job_id = $1`, [id])).rowCount,
    0,
    'no customer email was queued for a job that did not submit',
  );

  await call('POST', `/jobs/${id}/evidence/delivery/3`, token, { key: 'k/d3.jpg' });
  const done = await call('POST', `/jobs/${id}/submit`, token);
  assert.equal(done.statusCode, 200, done.body);
  assert.equal(done.json().job.status, 'awaiting_approval');
  assert.ok(done.json().job.submittedAt);

  const slots = ['pickup', 'load', 'delivery'].flatMap(
    s => done.json().job.evidence[s],
  );
  assert.equal(slots.length, TOTAL_REQUIRED_PHOTOS);
  assert.ok(slots.every((s: any) => s.uri));
}

// ── the customer is told exactly once ───────────────────────────────────────
{
  const { rows: before } = await q<{ n: string }>(
    `SELECT count(*)::text n FROM outbox WHERE job_id = $1 AND kind = 'job_complete'`,
    [submittedId],
  );
  assert.equal(before[0]!.n, '1', 'submit queued the completion email');

  // Replay the submit. It is already awaiting approval, so it is refused —
  // and even if it were not, the partial unique index makes the insert a no-op.
  await call('POST', `/jobs/${submittedId}/submit`, token);
  const { rows: after } = await q<{ n: string }>(
    `SELECT count(*)::text n FROM outbox WHERE job_id = $1 AND kind = 'job_complete'`,
    [submittedId],
  );
  assert.equal(after[0]!.n, '1', 'a replayed submit sends zero further emails');

  const payload = (
    await q<{ payload: any }>(`SELECT payload FROM outbox WHERE job_id = $1`, [submittedId])
  ).rows[0]!.payload;
  assert.doesNotMatch(
    JSON.stringify(payload),
    /J1-|CR-/,
    'Q2: no ticket-number literals — they are photographed, never keyed',
  );
}

// ── deleting a photo re-opens the step and demotes the job ──────────────────
{
  const before = await get(submittedId);
  assert.equal(before.status, 'awaiting_approval');

  const r = await call('DELETE', `/jobs/${submittedId}/evidence/delivery/1`, token);
  assert.equal(r.statusCode, 200, r.body);

  const after = r.json().job;
  assert.equal(after.status, 'in_progress', 'evidence and status cannot disagree');
  assert.equal(after.submittedAt, null);
  assert.equal(after.evidence.delivery[1].uri, null, 'the slot blanked');
  assert.equal(r.json().gate.satisfied, false, 'and the button re-locked');
  assert.match(after.evidence.delivery[1].hint, /^Tap to capture/);

  assert.equal(
    (await q(`SELECT 1 FROM job_evidence
               WHERE job_id = $1 AND step='delivery' AND slot_index=1`, [submittedId]))
      .rowCount,
    0,
    'the row went with it — the demotion and the delete are one transaction',
  );
}

// ── a driver can never reach 'done' ─────────────────────────────────────────
{
  const id = await freshJob();
  for (const url of [
    `/jobs/${id}/approve`,
    `/jobs/${id}/status`,
    `/jobs/${id}/setStatus`,
  ]) {
    const r = await call('POST', url, token, { status: 'done' });
    assert.ok(
      r.statusCode === 404 || r.statusCode === 403,
      `${url} must not exist for a driver (got ${r.statusCode})`,
    );
  }
  const { rows } = await q<{ n: string }>(
    `SELECT count(*)::text n FROM jobs WHERE id = $1 AND status = 'done'`,
    [id],
  );
  assert.equal(rows[0]!.n, '0');
}

// ── one driver cannot touch another's job ───────────────────────────────────
{
  const { rows } = await q<{ id: string }>(
    `SELECT id FROM jobs WHERE driver_id IS DISTINCT FROM $1 LIMIT 1`,
    [driver.id],
  );
  if (rows[0]) {
    const r = await call('POST', `/jobs/${rows[0].id}/seal-number`, token, {
      sealNo: 'HACK',
    });
    assert.equal(r.statusCode, 404, "another driver's job is not writable");
  }
}

// ── the office cannot use the driver write path ─────────────────────────────
{
  const id = await freshJob();
  const r = await call('POST', `/jobs/${id}/inspection/tires`, adminToken, {
    result: 'pass',
  });
  assert.equal(r.statusCode, 403, 'dispatch does not fill in a driver’s pre-trip');
}

// ── optimistic concurrency ──────────────────────────────────────────────────
{
  const id = await freshJob();
  const stale = (await get(id)).version;
  await call('POST', `/jobs/${id}/seal-number`, token, { sealNo: 'FIRST' });

  const r = await call('POST', `/jobs/${id}/seal-number`, token, {
    sealNo: 'SECOND',
    version: stale,
  });
  assert.equal(r.statusCode, 409, 'a stale write is refused, not silently applied');
  assert.equal((await get(id)).sealNo, 'FIRST');
}

// ── a defect cannot be reported on a job with no vehicle assigned ──────────
{
  const { rows } = await q<{ id: string }>(
    `SELECT id FROM jobs
      WHERE driver_id = $1 AND truck_id IS NULL AND chassis_id IS NULL LIMIT 1`,
    [driver.id],
  );
  if (rows[0]) {
    const id = rows[0].id;
    await q(`DELETE FROM inspection_items WHERE job_id = $1`, [id]);
    await q(`UPDATE jobs SET status='pending', step='pretrip' WHERE id = $1`, [id]);
    for (const item of INSPECTION_ITEMS.slice(0, 11)) {
      await call('POST', `/jobs/${id}/inspection/${item.id}`, token, { result: 'pass' });
    }
    await call('POST', `/jobs/${id}/inspection/lines`, token, {
      result: 'defect',
      note: 'Leak at glad hand.',
    });
    const r = await call('POST', `/jobs/${id}/report-defect`, token);
    assert.equal(r.statusCode, 422, 'refused in the gate’s language, not as a 500');
    assert.match(r.json().message, /assigned/i);
    assert.equal(
      (await q(`SELECT 1 FROM defects WHERE job_id = $1`, [id])).rowCount,
      0,
      'and no half-written legal record was left behind',
    );
  }
}

// ── defect path: job blocked, unit out of service, record written ───────────
{
  const { rows: unitJobs } = await q<{ id: string }>(
    `SELECT id FROM jobs WHERE driver_id = $1 AND truck_id IS NOT NULL ORDER BY id LIMIT 1`,
    [driver.id],
  );
  assert.ok(unitJobs[0], 'the seed has a job with a truck on it');
  const id = unitJobs[0].id;
  await tx(async c => {
    await c.query(`DELETE FROM inspection_items WHERE job_id = $1`, [id]);
    await c.query(`DELETE FROM defects WHERE job_id = $1`, [id]);
    await c.query(
      `UPDATE jobs SET status='pending', step='pretrip', pretrip_passed_at=NULL WHERE id = $1`,
      [id],
    );
    await c.query(`UPDATE fleet_units SET status='in_service'`);
  });
  for (const item of INSPECTION_ITEMS.slice(0, 11)) {
    await call('POST', `/jobs/${id}/inspection/${item.id}`, token, { result: 'pass' });
  }
  const noted = await call('POST', `/jobs/${id}/inspection/lines`, token, {
    result: 'defect',
    note: 'Leak at glad hand — will not hold air.',
  });
  assert.equal(noted.statusCode, 200);
  assert.equal(noted.json().gate.satisfied, false, 'a defect never satisfies pre-trip');

  const blocked = await call('POST', `/jobs/${id}/report-defect`, token);
  assert.equal(blocked.statusCode, 200, blocked.body);
  assert.equal(blocked.json().job.status, 'blocked');

  const job = await get(id);
  const { rows: unit } = await q<{ status: string }>(
    `SELECT status FROM fleet_units WHERE id = $1`,
    [job.truckId],
  );
  assert.equal(unit[0]?.status, 'out_of_service', 'the unit was flagged');

  const { rows: rec } = await q<{ note: string; reported_by: string }>(
    `SELECT note, reported_by FROM defects WHERE job_id = $1`,
    [id],
  );
  assert.equal(rec.length, 1);
  assert.match(rec[0]!.note, /glad hand/, 'W18 has the driver’s words to quote');
  assert.equal(rec[0]!.reported_by, driver.id, 'attributed');

  assert.equal(
    (await call('POST', `/jobs/${id}/advance`, token, { step: 'pretrip' })).statusCode,
    422,
    'a blocked job does not advance',
  );
}

// ── uploads: the server picks the key and presigns against the bucket ──────
{
  const id = await freshJob();

  const presign = await call('POST', '/uploads/presign', token, {
    jobId: id,
    purpose: 'evidence',
    step: 'pickup',
    slot: 0,
    contentType: 'image/jpeg',
    contentLength: 1024,
  });
  assert.equal(presign.statusCode, 200, presign.body);
  const { key, url } = presign.json() as { key: string; url: string };
  assert.match(key, new RegExp(`^jobs/${id}/evidence/pickup/0/`), 'server-chosen key');

  assert.equal(
    (await call('POST', '/uploads/presign', token, {
      jobId: id,
      purpose: 'evidence',
      step: 'pickup',
      slot: 0,
      contentType: 'application/x-msdownload',
      contentLength: 10,
    })).statusCode,
    415,
    'an executable is not a photo',
  );

  // Against the real bucket, because a signature is either right or it is a
  // 403 — there is no way to unit-test SigV4 that is not just re-implementing
  // it. A wrong signer fails here and nowhere else.
  const bytes = Buffer.from('jpegbytes');
  const put = await fetch(url, {
    method: 'PUT',
    body: bytes,
    headers: { 'content-type': 'image/jpeg' },
  });
  assert.equal(put.status, 200, `presigned PUT rejected: ${await put.text()}`);

  // The read side is signed too: the job payload carries a URL, not a key.
  const committed = await call('POST', `/jobs/${id}/evidence/pickup/0`, token, { key });
  assert.equal(committed.statusCode, 200, committed.body);
  const slot0 = committed.json().job.evidence.pickup[0] as { uri: string };
  assert.match(slot0.uri, /X-Amz-Signature=/, 'evidence is handed out presigned');

  const got = await fetch(slot0.uri);
  assert.equal(got.status, 200, 'the presigned GET actually resolves');
  assert.equal(Buffer.from(await got.arrayBuffer()).toString(), 'jpegbytes');

  const tampered = await fetch(slot0.uri.replace(/X-Amz-Signature=.*/, 'X-Amz-Signature=dead'));
  assert.equal(tampered.status, 403, 'a forged signature is refused by the bucket');
}

// ── the bucket credentials are required in production ───────────────────────
{
  // Well-known dev keys let anyone mint a PUT for any key in the bucket, so
  // the interesting assertion is that production refuses to boot without real
  // ones. Spawned, because the check runs at import time and this process has
  // already imported env.ts.
  const boot = (envv: Record<string, string>) =>
    spawnSync(
      process.execPath,
      ['--experimental-strip-types', '-e', "import('./src/env.ts')"],
      {
        env: { ...process.env, S3_ACCESS_KEY: '', S3_SECRET_KEY: '', ...envv },
        encoding: 'utf8',
      },
    );

  const refused = boot({ NODE_ENV: 'production' });
  assert.notEqual(refused.status, 0, 'production must not boot on the dev bucket keys');
  assert.match(refused.stderr, /S3_ACCESS_KEY/);

  assert.equal(
    boot({ NODE_ENV: 'production', S3_ACCESS_KEY: 'real', S3_SECRET_KEY: 'realsecret' }).status,
    0,
    'and boots once they are set',
  );
}

await app.close();
await pool.end();
console.log('writes: every gate holds server-side');
