/**
 * Wipes everything and leaves exactly one way in.
 *
 * `seed.ts` builds the demo dataset the test suites assert against; this is
 * its opposite, for testing against data you create yourself. It leaves ONE
 * admin, because there is deliberately no signup endpoint anywhere in this API
 * — with an empty `users` table nobody could sign in and the apps would be
 * unusable rather than empty.
 *
 * Everything else is reachable from the UI: drivers (W9), customers (W16),
 * fleet units (W17), jobs (W4). Pay periods create themselves on the first
 * approval.
 */
import { pool, tx } from './db.ts';
import { hash } from './password.ts';

const url = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1|db):/.test(url)) {
  throw new Error(`refusing to wipe a non-local database: ${url.replace(/:[^:@]*@/, ':***@')}`);
}

const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@a3tranz.com';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'Password@123';

await tx(async c => {
  await c.query(`TRUNCATE users, customers, fleet_units, jobs, job_legs,
    inspection_items, defects, job_evidence, job_photos, job_attachments,
    threads, messages, thread_reads, job_notes, pay_periods, pay_lines,
    notifications, notification_prefs, outbox, password_resets,
    sessions, login_attempts CASCADE`);

  await c.query(
    `INSERT INTO users (id,email,password_hash,name,initials,role,phone,base,active)
     VALUES ('ADM-001',$1,$2,'Admin','AD','admin','','Houston',true)`,
    [EMAIL, await hash(PASSWORD)],
  );
});

const { rows } = await pool.query<{ t: string; n: string }>(`
  SELECT 'users' t, count(*)::text n FROM users
  UNION ALL SELECT 'customers', count(*)::text FROM customers
  UNION ALL SELECT 'drivers', count(*)::text FROM users WHERE role = 'driver'
  UNION ALL SELECT 'fleet_units', count(*)::text FROM fleet_units
  UNION ALL SELECT 'jobs', count(*)::text FROM jobs
  UNION ALL SELECT 'pay_periods', count(*)::text FROM pay_periods
  UNION ALL SELECT 'threads', count(*)::text FROM threads
  UNION ALL SELECT 'notifications', count(*)::text FROM notifications
  ORDER BY 1`);
console.log(rows.map(r => `  ${r.t.padEnd(14)}${r.n}`).join('\n'));
console.log(`\nempty. the only account is: ${EMAIL} / ${PASSWORD}`);
console.log('everything else is yours to create: drivers, customers, fleet, jobs.');
await pool.end();
