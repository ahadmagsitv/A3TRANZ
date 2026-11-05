import { pool, tx } from './db.ts';
import { hash } from './password.ts';

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_WIPE !== '1') {
  throw new Error('refusing to wipe a production database (set ALLOW_WIPE=1 if you really mean it)');
}
const url = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1|db):/.test(url)) {
  throw new Error(`refusing to wipe a non-local database: ${url.replace(/:[^:@]*@/, ':***@')}`);
}

const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@a3tranz.com';
const PASSWORD = process.env.ADMIN_PASSWORD;
if (!PASSWORD || PASSWORD.length < 12) throw new Error('set ADMIN_PASSWORD (12+ chars) — there is no default');

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
