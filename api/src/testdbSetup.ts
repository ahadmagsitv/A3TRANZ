/**
 * Creates and migrates the test database. Run once by `pretest`.
 *
 * Idempotent: it exists after the first run and this is a no-op thereafter.
 */
import pg from 'pg';

const url = process.env.DATABASE_URL ?? '';
if (!/_test(\?|$)/.test(url)) {
  throw new Error(`refusing to prepare a non-test database: ${url}`);
}

const name = new URL(url).pathname.slice(1);
const admin = new URL(url);
admin.pathname = '/postgres';

const c = new pg.Client(admin.toString());
await c.connect();
const { rows } = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
if (!rows[0]) {
  // Identifier, not a parameter — pg cannot bind a database name. `name` comes
  // from our own connection string, never from a request.
  await c.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  console.log(`created test database ${name}`);
}
await c.end();
