/** Applies every unapplied api/migrations/*.sql in filename order, once. */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, q } from './db.ts';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

await q(`CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);

const done = new Set(
  (await q<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(r => r.name),
);
const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();

for (const f of files) {
  if (done.has(f)) continue;
  const sql = await readFile(join(dir, f), 'utf8');
  // Each migration is one transaction: a half-applied schema is worse than none.
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(sql);
    await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
    await c.query('COMMIT');
    console.log(`applied ${f}`);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error(`FAILED ${f}`);
    throw e;
  } finally {
    c.release();
  }
}
console.log(`schema up to date (${files.length} migration${files.length === 1 ? '' : 's'})`);
await pool.end();
