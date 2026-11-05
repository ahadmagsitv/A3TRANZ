import { tx, q } from './db.ts';
import { completionEmail, sendMail, resetEmail } from './mailer.ts';
import { notify } from './notify.ts';

const MAX_ATTEMPTS = 8;

export const drainOutbox = async (limit = 20): Promise<number> => {
  let sent = 0;
  const touched: string[] = [];

  for (let i = 0; i < limit; i++) {
    const done = await tx(async c => {
      const { rows } = await c.query<{
        id: string;
        kind: string;
        job_id: string | null;
        payload: Record<string, unknown>;
        attempts: number;
      }>(
        `SELECT id, kind, job_id, payload, attempts
           FROM outbox
          WHERE sent_at IS NULL
            AND attempts < $1
            AND next_attempt_at <= now()
            AND NOT (id = ANY($2::bigint[]))
          ORDER BY next_attempt_at
          LIMIT 1
          FOR UPDATE SKIP LOCKED`,
        [MAX_ATTEMPTS, touched],
      );
      const row = rows[0];
      if (!row) return false;
      touched.push(row.id);

      try {
        if (row.kind === 'job_complete') {
          const { rows: job } = await c.query<{
            id: string;
            title: string;
            container_no: string | null;
            delivery_location: string;
            customer_name: string;
            email: string | null;
            cc_emails: string[];
            notify: boolean;
          }>(
            `SELECT j.id, j.title, j.container_no, j.delivery_location,
                    cu.name AS customer_name, cu.email, cu.cc_emails,
                    cu.notify_on_completion AS notify
               FROM jobs j JOIN customers cu ON cu.id = j.customer_id
              WHERE j.id = $1`,
            [row.job_id],
          );
          const j = job[0];
          const to = (row.payload.to as string | undefined) ?? j?.email ?? null;

          if (!j || !to || !j.notify) {
            await c.query(
              `UPDATE outbox SET sent_at = now(), last_error = $2 WHERE id = $1`,
              [row.id, j && !j.notify ? 'suppressed: customer opted out' : 'no recipient'],
            );
            return true;
          }

          const { subject, text, html } = completionEmail({
            id: j.id,
            title: j.title,
            customerName: j.customer_name,
            containerNo: j.container_no,
            deliveryLocation: j.delivery_location,
          });
          const cc = j.cc_emails.filter(a => a.toLowerCase() !== to.toLowerCase());
          await sendMail({ to, cc, subject, text, html });
        } else if (row.kind === 'password_reset') {
          const to = row.payload.to as string | undefined;
          if (!to) {
            await c.query(
              `UPDATE outbox SET sent_at = now(), last_error = $2 WHERE id = $1`,
              [row.id, 'no recipient'],
            );
            return true;
          }
          const { subject, text, html } = resetEmail({
            name: (row.payload.name as string | undefined) ?? 'there',
            token: row.payload.token as string,
            invite: row.payload.invite === true,
          });
          await sendMail({ to, subject, text, html });
        } else {
          await c.query(
            `UPDATE outbox SET sent_at = now(), last_error = $2 WHERE id = $1`,
            [row.id, `unknown kind '${row.kind}'`],
          );
          return true;
        }

        await c.query(`UPDATE outbox SET sent_at = now() WHERE id = $1`, [row.id]);
        sent += 1;
        return true;
      } catch (err) {
        await c.query(
          `UPDATE outbox
              SET attempts = attempts + 1,
                  last_error = $2,
                  next_attempt_at = now() + (least(power(2, attempts) * 30, 3600)
                                             || ' seconds')::interval
            WHERE id = $1`,
          [row.id, String(err instanceof Error ? err.message : err).slice(0, 500)],
        );
        return true;
      }
    });

    if (!done) break;
  }

  return sent;
};

export const sweepOverdue = async (): Promise<number> => {
  const { rows } = await q<{ id: string; title: string; driver_id: string }>(
    `SELECT id, title, driver_id FROM jobs
      WHERE due_at < now() AND status <> 'done' AND driver_id IS NOT NULL`,
  );

  let created = 0;
  for (const job of rows) {
    const made = await notify(
      { query: (t, p) => q(t, p) as never },
      {
        userId: job.driver_id,
        kind: 'overdue',
        title: 'Job overdue',
        body: `${job.id} · ${job.title}`,
        jobId: job.id,
        once: job.id,
      },
    );
    if (made) created += 1;
  }
  return created;
};

export const runOnce = async (): Promise<{ sent: number; overdue: number }> => ({
  sent: await drainOutbox(),
  overdue: await sweepOverdue(),
});

export const startWorker = (intervalMs = 10_000): (() => void) => {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const tick = async () => {
    if (stopped) return;
    try {
      await runOnce();
    } catch (err) {
      console.error('worker tick failed', err);
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };

  timer = setTimeout(tick, intervalMs);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
};
