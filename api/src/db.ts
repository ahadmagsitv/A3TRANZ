import pg from 'pg';

const { Pool } = pg;

pg.types.setTypeParser(1082, (v: string) => v);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export const q = <T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> => pool.query<T>(text, params);

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
