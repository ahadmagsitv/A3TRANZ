import pg from 'pg';

// Postgres returns bigint/numeric as strings to avoid precision loss. Money is
// integer cents in `integer` columns so it arrives as a number already; bigserial
// ids are the only thing that would surprise, and nothing reads outbox.id.
const { Pool } = pg;

/**
 * `date` columns come back as strings, not Dates.
 *
 * node-pg otherwise builds a Date at LOCAL midnight for a bare calendar date,
 * and every downstream conversion then shifts it: `.toISOString()` rolls it a
 * day back east of UTC, and formatting it in `America/Chicago` rolls it back
 * further still. A customer created today read "Aug 2026" on a +05:00 machine.
 *
 * A calendar date has no time and no zone — 'YYYY-MM-DD' is the honest
 * representation, and the callers that want a label parse it explicitly.
 */
pg.types.setTypeParser(1082, (v: string) => v);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export const q = <T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> => pool.query<T>(text, params);

/** Everything that must not half-happen goes through here. */
export const tx = async <T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
};
