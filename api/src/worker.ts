/**
 * The background worker: drains the outbox and sweeps for overdue jobs.
 *
 * Runs in-process alongside the API. That is deliberate — a separate service
 * for two periodic jobs is a second thing to deploy, monitor and page someone
 * about at 3am.
 *
 * ponytail: in-process, and `FOR UPDATE SKIP LOCKED` makes it safe to run more
 * than one instance. Split it out the day the work stops fitting in the gaps
 * between requests.
 */
import { tx, q } from './db.ts';
import { completionEmail, sendMail, resetEmail } from './mailer.ts';
import { notify } from './notify.ts';

const MAX_ATTEMPTS = 8;

/**
 * One pass over unsent outbox rows.
 *
 * `FOR UPDATE SKIP LOCKED` is what lets two workers run without both grabbing
 * the same row — the second simply skips it rather than blocking or, worse,
 * sending the same email twice.
 *
 * The send happens INSIDE the row's transaction. That means a crash mid-send
 * rolls back to unsent and the mail may go twice; the alternative — commit
 * first, then send — loses the mail entirely on the same crash. For a
 * completion notice, a rare duplicate beats a silent miss.
 */
export const drainOutbox = async (limit = 20): Promise<number> => {
  let sent = 0;
  // A pass touches each row AT MOST ONCE. Without this the loop re-picks the
  // row it just failed on and spends all eight attempts inside a single tick,
  // which is not a retry policy — it is a fast way to give up.
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
            notify: boolean;
          }>(
            `SELECT j.id, j.title, j.container_no, j.delivery_location,
                    cu.name AS customer_name, cu.email,
                    cu.notify_on_completion AS notify
               FROM jobs j JOIN customers cu ON cu.id = j.customer_id
              WHERE j.id = $1`,
            [row.job_id],
          );
          const j = job[0];
          const to = (row.payload.to as string | undefined) ?? j?.email ?? null;

          // The opt-in is re-checked at send time, not just at queue time: a
          // customer who switched it off between submit and send should not
          // then receive the mail.
          if (!j || !to || !j.notify) {
            await c.query(
              `UPDATE outbox SET sent_at = now(), last_error = $2 WHERE id = $1`,
              [row.id, j && !j.notify ? 'suppressed: customer opted out' : 'no recipient'],
            );
            return true;
          }

          const { subject, text } = completionEmail({
            id: j.id,
            title: j.title,
            customerName: j.customer_name,
            containerNo: j.container_no,
            deliveryLocation: j.delivery_location,
          });
          await sendMail({ to, subject, text });
        } else if (row.kind === 'password_reset') {
          // Re-read nothing: a reset is addressed to whoever asked, at the
          // address they had when they asked. Unlike the completion mail there
          // is no opt-in to re-check — this is transactional, not marketing.
          const to = row.payload.to as string | undefined;
          if (!to) {
            await c.query(
              `UPDATE outbox SET sent_at = now(), last_error = $2 WHERE id = $1`,
              [row.id, 'no recipient'],
            );
            return true;
          }
          const { subject, text } = resetEmail({
            name: (row.payload.name as string | undefined) ?? 'there',
            token: row.payload.token as string,
            invite: row.payload.invite === true,
          });
          await sendMail({ to, subject, text });
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
        // Roll the attempt forward but keep the row unsent, so a transient
        // provider failure is retried rather than lost.
        // Exponential backoff: 30s, 1m, 2m, 4m … capped by MAX_ATTEMPTS.
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

/**
 * §6.8 `overdue`. The only trigger with no request behind it — nobody presses
 * a button to make a job late, so something has to notice.
 *
 * Overdue itself stays DERIVED (there is no column and no 'overdue' status);
 * this only creates the alert. The deterministic id means a job produces one
 * overdue notification no matter how often the sweep runs.
 */
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

/** Started by the server; stopped when it closes. */
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
