/**
 * Phase 1 check. Runs against the seeded dev database — auth is a trust
 * boundary, so this asserts on real rows and real hashes, not on mocks.
 *
 *   npm run seed -w @a3/api && npm run test -w @a3/api
 */
import assert from 'node:assert/strict';
import { can } from '@a3/domain';
import { build } from './server.ts';
import { pool, q } from './db.ts';
import { issueReset } from './password.ts';
import { reseed } from './testdb.ts';

reseed();

const app = build();
await app.ready();

const call = (method: string, url: string, opts: {
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
} = {}) =>
  app.inject({
    method: method as 'GET',
    url,
    payload: opts.body as object | undefined,
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...opts.headers,
    },
  });

const DRIVER = { email: 'john.reyes@a3transport.com', password: 'a3transport' };

// Throttling counts real failures, so clear the ledger before asserting on it.
await q('DELETE FROM login_attempts');

// ── login ───────────────────────────────────────────────────────────────────
{
  const bad = await call('POST', '/auth/login', {
    body: { email: DRIVER.email, password: 'wrong' },
  });
  assert.equal(bad.statusCode, 401);
  assert.equal(bad.json().code, 'invalid_credentials');

  const missing = await call('POST', '/auth/login', {
    body: { email: 'nobody@nowhere.test', password: 'wrong' },
  });
  assert.equal(
    missing.json().message,
    bad.json().message,
    'unknown email and wrong password are indistinguishable — no enumeration oracle',
  );

  const ok = await call('POST', '/auth/login', { body: DRIVER });
  assert.equal(ok.statusCode, 200);
  assert.ok(ok.json().token, 'a token comes back');
  assert.equal(ok.json().user.role, 'driver');
  assert.equal(ok.json().user.password_hash, undefined, 'no hash on the wire');
}

const login = async (email: string, password = 'a3transport'): Promise<string> => {
  const r = await call('POST', '/auth/login', { body: { email, password } });
  assert.equal(r.statusCode, 200, `login failed for ${email}: ${r.body}`);
  return r.json().token as string;
};

const driverToken = await login(DRIVER.email);
const { rows: [admin] } = await q<{ id: string; email: string }>(
  `SELECT id, email FROM users WHERE role = 'admin' LIMIT 1`,
);
const adminToken = await login(admin!.email);

// ── the token is opaque and stored hashed ───────────────────────────────────
{
  const { rows } = await q<{ n: string }>(
    'SELECT count(*)::text n FROM sessions WHERE token_hash = $1',
    [driverToken],
  );
  assert.equal(rows[0]?.n, '0', 'the raw token is never what sits in the table');
}

// ── me ──────────────────────────────────────────────────────────────────────
{
  assert.equal((await call('GET', '/auth/me')).statusCode, 401, 'no token → 401');
  assert.equal(
    (await call('GET', '/auth/me', { token: 'not-a-real-token' })).statusCode,
    401,
  );
  const me = await call('GET', '/auth/me', { token: driverToken });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.email, DRIVER.email);
}

// ── office-only routes refuse a driver ──────────────────────────────────────
{
  const asDriver = await call('GET', '/auth/team', { token: driverToken });
  assert.equal(asDriver.statusCode, 403, 'a driver cannot read the team list');

  const asAdmin = await call('GET', '/auth/team', { token: adminToken });
  assert.equal(asAdmin.statusCode, 200);
  const roles = (asAdmin.json().users as { role: string }[]).map(u => u.role);
  assert.ok(roles.length > 0);
  assert.ok(!roles.includes('driver'), 'the team list never contains drivers');
}

// ── W13 add member: manageTeam only, office roles only ──────────────────────
{
  const { rows: [dispatcher] } = await q<{ email: string }>(
    `SELECT email FROM users WHERE role = 'dispatcher' LIMIT 1`,
  );
  const dispatcherToken = await login(dispatcher!.email);

  assert.equal(
    (await call('GET', '/auth/team', { token: dispatcherToken })).statusCode,
    403,
    'a dispatcher cannot read the roster either — manageTeam, not office-only',
  );

  const member = {
    name: 'Nadia Ellis',
    email: `nadia.${Date.now()}@a3transport.com`,
    role: 'assistant_manager',
    tempPassword: 'temp-pass-1234',
  };

  assert.equal(
    (await call('POST', '/auth/team', { token: dispatcherToken, body: member })).statusCode,
    403,
    'a dispatcher cannot mint colleagues',
  );

  // The one role the team screen must never be able to create: a driver row
  // is reached through /drivers and carries driver-only columns.
  assert.equal(
    (await call('POST', '/auth/team', {
      token: adminToken,
      body: { ...member, role: 'driver' },
    })).statusCode,
    400,
    'the team screen cannot mint a driver',
  );

  const created = await call('POST', '/auth/team', { token: adminToken, body: member });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().user.role, 'assistant_manager');
  assert.equal(created.json().user.initials, 'NE');
  assert.match(created.json().user.id, /^ADM-\d+$/);

  assert.equal(
    (await call('POST', '/auth/team', { token: adminToken, body: member })).statusCode,
    409,
    'the same email twice is a conflict, not a second account',
  );

  // The temporary password actually signs them in, and the role they were
  // given is the role the server enforces from then on.
  const newToken = await login(member.email, member.tempPassword);
  assert.equal(
    (await call('POST', '/payroll/periods/PP-001/mark-paid', {
      token: newToken,
      body: { reference: 'X', paidAt: '2026-01-01' },
    })).statusCode,
    403,
    'assistant manager may view payroll but never mark it paid',
  );
}

// ── W13 row menu: edit, deactivate, reactivate, delete ──────────────────────
{
  const fresh = {
    name: 'Owen Pike',
    email: `owen.${Date.now()}@a3transport.com`,
    role: 'dispatcher',
    tempPassword: 'temp-pass-1234',
  };
  const id = (await call('POST', '/auth/team', { token: adminToken, body: fresh }))
    .json().user.id as string;
  const theirToken = await login(fresh.email, fresh.tempPassword);

  // Edit: a rename moves the initials with it, or the avatar keeps showing
  // the initials of a name nobody has.
  const renamed = await call('PATCH', `/auth/team/${id}`, {
    token: adminToken,
    body: { name: 'Owen Van Pike', role: 'assistant_manager' },
  });
  assert.equal(renamed.statusCode, 200, renamed.body);
  assert.equal(renamed.json().user.initials, 'OV');
  assert.equal(renamed.json().user.role, 'assistant_manager');

  // A role change revokes: the session carries no role, so a demoted manager
  // would otherwise keep manager access until they signed out.
  assert.equal(
    (await call('GET', '/auth/me', { token: theirToken })).statusCode,
    401,
    'changing a role signs them out',
  );

  // ...but a plain rename does not: there is nothing stale about the session.
  const stillIn = await login(fresh.email, fresh.tempPassword);
  assert.equal(
    (await call('PATCH', `/auth/team/${id}`, {
      token: adminToken,
      body: { name: 'Owen Van Pike', role: 'assistant_manager' },
    })).statusCode,
    200,
    'sending the unchanged role back is not a role change',
  );
  assert.equal(
    (await call('GET', '/auth/me', { token: stillIn })).statusCode,
    200,
    'an edit that does not change the role leaves them signed in',
  );

  // Deactivate → they cannot sign in. Reactivate → they can.
  assert.equal(
    (await call('PATCH', `/auth/team/${id}`, { token: adminToken, body: { active: false } }))
      .statusCode,
    200,
  );
  assert.equal(
    (await call('POST', '/auth/login', { body: { email: fresh.email, password: fresh.tempPassword } }))
      .statusCode,
    403,
    'a deactivated member cannot sign in',
  );
  assert.equal(
    (await call('PATCH', `/auth/team/${id}`, { token: adminToken, body: { active: true } }))
      .statusCode,
    200,
  );
  await login(fresh.email, fresh.tempPassword);

  // A stood-down member still appears — this is the screen that puts them back.
  const roster = (await call('GET', '/auth/team', { token: adminToken })).json()
    .users as { id: string; active: boolean }[];
  assert.ok(roster.some(u => u.id === id && u.active));

  // Never yourself. This one guard is what keeps a manageTeam holder standing.
  for (const body of [{ active: false }, { role: 'dispatcher' }]) {
    assert.equal(
      (await call('PATCH', `/auth/team/${admin!.id}`, { token: adminToken, body })).statusCode,
      403,
      'you cannot demote or deactivate yourself',
    );
  }
  assert.equal(
    (await call('DELETE', `/auth/team/${admin!.id}`, { token: adminToken })).statusCode,
    403,
    'you cannot delete yourself',
  );

  // Delete works on someone with no history.
  assert.equal(
    (await call('DELETE', `/auth/team/${id}`, { token: adminToken })).statusCode,
    204,
  );
  assert.equal(
    (await call('DELETE', `/auth/team/${id}`, { token: adminToken })).statusCode,
    404,
    'deleting twice is a 404, not a second delete',
  );

  // ...and is refused for someone the record still points at. The FK is the
  // rule — one note written by them is enough for Postgres to refuse, and
  // this asserts that refusal reaches the user as advice rather than a 500.
  const kept = (await call('POST', '/auth/team', {
    token: adminToken,
    body: { ...fresh, email: `kept.${Date.now()}@a3transport.com` },
  })).json().user.id as string;
  const { rows: [job] } = await q<{ id: string }>('SELECT id FROM jobs LIMIT 1');
  await q(
    `INSERT INTO job_notes (id, job_id, author_id, body) VALUES ($1, $2, $3, 'note')`,
    [`NOTE-${Date.now()}`, job!.id, kept],
  );

  const refused = await call('DELETE', `/auth/team/${kept}`, { token: adminToken });
  assert.equal(refused.statusCode, 409, 'history keeps the account');
  assert.match(refused.json().message, /[Dd]eactivate/);

  // The advice the 409 gives has to actually work.
  assert.equal(
    (await call('PATCH', `/auth/team/${kept}`, { token: adminToken, body: { active: false } }))
      .statusCode,
    200,
  );
}

// ── RBAC map is the one the UI renders ──────────────────────────────────────
{
  assert.equal(can('admin', 'markPayrollPaid'), true);
  assert.equal(
    can('assistant_manager', 'markPayrollPaid'),
    false,
    'assistant manager may view payroll but never mark it paid',
  );
  assert.equal(can('dispatcher', 'approveJobs'), false);
  assert.equal(can('driver', 'createJobs'), false, 'drivers hold no office capability');
}

// ── revocation: the reason these are not JWTs ───────────────────────────────
{
  const token = await login(DRIVER.email);
  assert.equal((await call('GET', '/auth/me', { token })).statusCode, 200);

  await q(`UPDATE users SET active = false WHERE email = $1`, [DRIVER.email]);
  const after = await call('GET', '/auth/me', { token });
  assert.equal(after.statusCode, 403, 'deactivating logs them out on the NEXT request');
  await q(`UPDATE users SET active = true WHERE email = $1`, [DRIVER.email]);

  // logout kills the token, and a second logout still succeeds
  assert.equal((await call('POST', '/auth/logout', { token })).statusCode, 204);
  assert.equal((await call('GET', '/auth/me', { token })).statusCode, 401);
  assert.equal(
    (await call('POST', '/auth/logout', { token })).statusCode,
    204,
    'logging out twice does not strand the client on a 401',
  );
}

// ── expiry is enforced by the query, not by a background job ────────────────
{
  const token = await login(DRIVER.email);
  await q(
    `UPDATE sessions SET expires_at = now() - interval '1 second'
      WHERE token_hash = encode(digest($1,'sha256'),'hex')`,
    [token],
  ).catch(async () => {
    // pgcrypto may not be installed; fall back to expiring every live session.
    await q(`UPDATE sessions SET expires_at = now() - interval '1 second'
              WHERE revoked_at IS NULL`);
  });
  assert.equal((await call('GET', '/auth/me', { token })).statusCode, 401);
}

// ── reset never reveals whether an account exists ────────────────────────────
{
  const real = await call('POST', '/auth/reset-request', { body: { email: DRIVER.email } });
  const fake = await call('POST', '/auth/reset-request', {
    body: { email: 'nobody@nowhere.test' },
  });
  assert.equal(real.statusCode, 200);
  assert.equal(fake.statusCode, 200);
  assert.equal(
    real.json().expiryLabel,
    fake.json().expiryLabel,
    'same copy either way — M3-link-sent cannot be used to probe for accounts',
  );

  const { rows } = await q<{ n: string }>(
    `SELECT count(*)::text n FROM password_resets pr
       JOIN users u ON u.id = pr.user_id WHERE u.email = $1`,
    [DRIVER.email],
  );
  assert.equal(rows[0]?.n, '1', 'but a token really was issued for the real one');
}

// ── reset links are single use, time limited, and end every session ─────────
{
  const { rows: [u] } = await q<{ id: string }>(
    'SELECT id FROM users WHERE email = $1', [DRIVER.email],
  );
  const userId = u!.id;

  assert.equal(
    (await call('POST', '/auth/reset', {
      body: { token: 'not-a-real-token', password: 'brand-new-pw' },
    })).statusCode,
    401,
    'a guessed token is worth nothing',
  );

  const short = await call('POST', '/auth/reset', {
    body: { token: await issueReset(pool, userId, '30 minutes'), password: 'short' },
  });
  assert.equal(short.json().code, 'password_too_short');

  // A live session from before the reset must not survive it.
  const before = await login(DRIVER.email);
  assert.equal((await call('GET', '/auth/me', { token: before })).statusCode, 200);

  const token = await issueReset(pool, userId, '30 minutes');
  assert.equal(
    (await call('POST', '/auth/reset', { body: { token, password: 'brand-new-pw' } }))
      .statusCode,
    200,
  );
  assert.equal(
    (await call('GET', '/auth/me', { token: before })).statusCode,
    401,
    'resetting signs out the sessions someone else may be holding',
  );

  assert.equal(
    (await call('POST', '/auth/reset', { body: { token, password: 'another-pw' } }))
      .statusCode,
    401,
    'the same link cannot be redeemed twice',
  );

  assert.equal(
    (await call('POST', '/auth/login', { body: DRIVER })).statusCode,
    401,
    'the old password really is gone',
  );
  assert.equal(
    (await call('POST', '/auth/login', {
      body: { email: DRIVER.email, password: 'brand-new-pw' },
    })).statusCode,
    200,
  );

  // An expired link is refused even though it was never used.
  const stale = await issueReset(pool, userId, '30 minutes');
  await q(`UPDATE password_resets SET expires_at = now() - interval '1 second'
            WHERE user_id = $1`, [userId]);
  assert.equal(
    (await call('POST', '/auth/reset', { body: { token: stale, password: 'later-pw' } }))
      .statusCode,
    401,
    'an expired link is refused',
  );

  // Put the seeded password back — the throttle block below signs in with it.
  await call('POST', '/auth/reset', {
    body: { token: await issueReset(pool, userId, '30 minutes'), password: DRIVER.password },
  });
  await q('DELETE FROM login_attempts');
}

// ── throttle ────────────────────────────────────────────────────────────────
{
  await q('DELETE FROM login_attempts');
  let sawThrottle = false;
  for (let i = 0; i < 12; i++) {
    const r = await call('POST', '/auth/login', {
      body: { email: DRIVER.email, password: 'wrong' },
    });
    if (r.statusCode === 429) {
      sawThrottle = true;
      break;
    }
  }
  assert.ok(sawThrottle, 'repeated failures are throttled');

  // A throttled email must not lock out a correct password forever, but it
  // must not be bypassable by simply knowing it either.
  const still = await call('POST', '/auth/login', { body: DRIVER });
  assert.equal(still.statusCode, 429, 'the throttle applies to the real password too');
  await q('DELETE FROM login_attempts');
  assert.equal((await call('POST', '/auth/login', { body: DRIVER })).statusCode, 200);
}

// ── the two 403s a client must tell apart ───────────────────────────────────
{
  // Both are 403. One means "sign in again as someone else" and the clients
  // drop the session for it; the other means "you are signed in, you just
  // cannot do that" and must leave the user exactly where they are. If they
  // ever share a code again, a dispatcher opening payroll gets logged out.
  const token = await login(DRIVER.email);

  const rbac = await call('GET', '/customers', { token });
  assert.equal(rbac.statusCode, 403);
  assert.equal(rbac.json().code, 'forbidden', 'a role refusal stays generic');

  await q(`UPDATE users SET active = false WHERE email = $1`, [DRIVER.email]);
  const dead = await call('GET', '/jobs', { token });
  await q(`UPDATE users SET active = true WHERE email = $1`, [DRIVER.email]);

  assert.equal(dead.statusCode, 403);
  assert.equal(
    dead.json().code,
    'inactive_account',
    'a dead account is distinguishable from a refused action',
  );
}

// ── CORS: the browser has to be allowed to read the answer ──────────────────
{
  // admin-web runs on another port, so every call it makes is cross-origin.
  // The API answered these fine to curl while the browser refused them, which
  // surfaced as "cannot reach the server" against a server that was running.
  const preflight = await call('OPTIONS', '/auth/login', {
    headers: {
      origin: 'http://localhost:3000',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  });
  assert.equal(preflight.statusCode, 204, 'the preflight must answer, not 404');
  assert.equal(
    preflight.headers['access-control-allow-origin'],
    'http://localhost:3000',
  );
  assert.match(String(preflight.headers['access-control-allow-headers']), /authorization/);

  const real = await call('POST', '/auth/login', {
    body: DRIVER,
    headers: { origin: 'http://localhost:3000' },
  });
  assert.equal(real.headers['access-control-allow-origin'], 'http://localhost:3000');
  assert.equal(real.headers.vary, 'Origin', 'the response varies by origin');

  // An allowlist, not `*`: a page the user happens to be visiting must not be
  // able to read their jobs.
  const stranger = await call('POST', '/auth/login', {
    body: DRIVER,
    headers: { origin: 'http://evil.example' },
  });
  assert.equal(
    stranger.headers['access-control-allow-origin'],
    undefined,
    'an unlisted origin is not handed the response',
  );
}

await app.close();
await pool.end();
console.log('auth: all checks pass');
