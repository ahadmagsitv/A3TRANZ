import type { PoolClient } from 'pg';
import type { NotificationKind } from '@a3/domain';
import { q } from './db.ts';
import { push } from './fcm.ts';

interface Querier {
  query(text: string, params?: unknown[]): Promise<{ rowCount: number | null }>;
}

export interface NotifyInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  jobId?: string | null;
  threadId?: string | null;
  once?: string;
}

export const notify = async (
  db: Querier,
  n: NotifyInput,
): Promise<boolean> => {
  const { rowCount } = await db.query(
    `INSERT INTO notifications (id, user_id, kind, title, body, job_id, thread_id)
     SELECT $1, $2, $3, $4, $5, $6, $7
      WHERE NOT EXISTS (
        SELECT 1 FROM notification_prefs p
         WHERE p.user_id = $2 AND p.kind = $3 AND p.enabled = false
      )
     ON CONFLICT (id) DO NOTHING`,
    [
      n.once ? `NOT-${n.kind}-${n.once}` : `NOT-${crypto.randomUUID()}`,
      n.userId,
      n.kind,
      n.title,
      n.body,
      n.jobId ?? null,
      n.threadId ?? null,
    ],
  );
  const inserted = (rowCount ?? 0) > 0;

  if (inserted) {
    void push({
      userId: n.userId,
      title: n.title,
      body: n.body,
      data: {
        kind: n.kind,
        ...(n.jobId ? { jobId: n.jobId } : {}),
        ...(n.threadId ? { threadId: n.threadId } : {}),
      },
    }).catch(() => {
    });
  }

  return inserted;
};

export const notifyPooled = (n: NotifyInput): Promise<boolean> =>
  notify({ query: (t, p) => q(t, p) as never }, n);

export const announceOwnerChange = async (
  jobId: string,
  title: string,
  previousDriverId: string | null,
  driverId: string | null,
): Promise<void> => {
  if (previousDriverId === driverId) return;
  const body = `${jobId} · ${title}`;
  if (driverId) {
    await notifyPooled({
      userId: driverId,
      kind: 'job_assigned',
      title: 'New job assigned',
      body,
      jobId,
    });
  }
  if (previousDriverId) {
    await notifyPooled({
      userId: previousDriverId,
      kind: 'job_updated',
      title: 'Removed from job',
      body,
      jobId,
    });
  }
};

export type { PoolClient };
