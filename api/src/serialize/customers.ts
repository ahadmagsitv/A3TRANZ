import { q } from '../db.ts';

export interface CustomerOut {
  id: string;
  name: string;
  shortName: string;
  email: string | null;
  contactName: string | null;
  phone: string | null;
  notifyOnCompletion: boolean;
  ccEmails: string[];
  customerSince: string | null;
  activeJobs: number;
  lastJobAt: string | null;
}

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
  ccEmails: r.cc_emails ?? [],
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
