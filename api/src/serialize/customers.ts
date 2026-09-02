/**
 * One customer shape, three endpoints.
 *
 * `GET /customers` mapped the columns, `POST` built an object by hand, and
 * `PATCH` returned `SELECT *` — raw snake_case. A client written against the
 * list got `undefined` for `notifyOnCompletion` after saving one. The fix is
 * for all three to load through here (BACKEND_PLAN §4: the presentation shape
 * is the server's job, and there is one of it).
 */
import { q } from '../db.ts';

export interface CustomerOut {
  id: string;
  name: string;
  shortName: string;
  email: string | null;
  contactName: string | null;
  phone: string | null;
  notifyOnCompletion: boolean;
  customerSince: string | null;
  activeJobs: number;
  lastJobAt: string | null;
}

/** Active-job count and last-assignment date, derived rather than stored. */
const COUNTS = `
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE j.status <> 'done') AS active_jobs,
           max(j.assigned_at)                          AS last_job_at
    FROM jobs j WHERE j.customer_id = cu.id
  ) k ON true`;

export const toCustomer = (r: Record<string, any>): CustomerOut => ({
  id: r.id,
  name: r.name,
  shortName: r.short_name,
  email: r.email,
  contactName: r.contact_name,
  phone: r.phone,
  notifyOnCompletion: r.notify_on_completion,
  // Already 'YYYY-MM-DD' — see the date parser in db.ts.
  customerSince: r.customer_since ?? null,
  activeJobs: Number(r.active_jobs ?? 0),
  lastJobAt: r.last_job_at ? r.last_job_at.toISOString() : null,
});

export const loadCustomers = async (): Promise<CustomerOut[]> => {
  const { rows } = await q<Record<string, any>>(
    `SELECT cu.*, k.* FROM customers cu ${COUNTS} ORDER BY cu.name`,
  );
  return rows.map(toCustomer);
};

export const loadCustomer = async (id: string): Promise<CustomerOut | null> => {
  const { rows } = await q<Record<string, any>>(
    `SELECT cu.*, k.* FROM customers cu ${COUNTS} WHERE cu.id = $1`,
    [id],
  );
  return rows[0] ? toCustomer(rows[0]) : null;
};
