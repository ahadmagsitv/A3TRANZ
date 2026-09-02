/**
 * One driver shape, every endpoint.
 *
 * `GET /drivers` mapped the columns while `POST /drivers/:id/deactivate`
 * returned `{id, name, active}` — so the row the table re-rendered after a
 * deactivate had no email, no base and no job counts. Same lesson as
 * customers: the presentation shape is the server's job and there is one of it.
 */
import type { Driver } from '@a3/domain';
import { q } from '../db.ts';

/**
 * Job counts per driver, derived — there is no column to read. Exported
 * because M18's overview reads the same counts without the driver row.
 */
export const DRIVER_COUNTS = `
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE j.status = 'done')                          AS done,
      count(*) FILTER (WHERE j.status = 'in_progress')                   AS in_progress,
      count(*) FILTER (WHERE j.due_at < now() AND j.status <> 'done')    AS overdue,
      count(*) FILTER (WHERE j.status = 'done'
                         AND j.approved_at > now() - interval '7 days')  AS done_week,
      count(*) FILTER (WHERE j.status = 'pending')                       AS pending
    FROM jobs j WHERE j.driver_id = u.id
  ) c ON true`;

export const toDriver = (r: Record<string, any>): Driver => ({
  id: r.id,
  name: r.name,
  initials: r.initials,
  email: r.email,
  phone: r.phone,
  role: 'Driver',
  base: r.base ?? '',
  active: r.active,
  joinedAt: r.joined_at ? r.joined_at.toISOString() : null,
  lastActiveAt: r.last_active_at ? r.last_active_at.toISOString() : null,
  jobsCompleted: Number(r.done ?? 0),
  jobsInProgress: Number(r.in_progress ?? 0),
  jobsOverdue: Number(r.overdue ?? 0),
});

export const loadDrivers = async (): Promise<Driver[]> => {
  const { rows } = await q<Record<string, any>>(
    `SELECT u.*, c.* FROM users u ${DRIVER_COUNTS} WHERE u.role = 'driver' ORDER BY u.name`,
  );
  return rows.map(toDriver);
};

export const loadDriver = async (id: string): Promise<Driver | null> => {
  const { rows } = await q<Record<string, any>>(
    `SELECT u.*, c.* FROM users u ${DRIVER_COUNTS} WHERE u.id = $1 AND u.role = 'driver'`,
    [id],
  );
  return rows[0] ? toDriver(rows[0]) : null;
};
