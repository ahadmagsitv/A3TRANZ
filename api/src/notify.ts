/**
 * The one place a notification is created.
 *
 * Every §6.8 trigger routes through here so the driver's on/off switch is
 * honoured in exactly one place. A trigger that inserted its own row would
 * silently ignore the preference, and nobody would notice until a driver who
 * muted something kept receiving it.
 *
 * Ids are DETERMINISTIC where the event can only happen once (a job is
 * assigned once, approved once, goes overdue once). That makes every insert
 * idempotent under `ON CONFLICT DO NOTHING`, so a retried request or a
 * repeated sweep cannot stack duplicates in the driver's Alerts tab.
 */
import type { PoolClient } from 'pg';
import type { NotificationKind } from '@a3/domain';
import { q } from './db.ts';

interface Querier {
  query(text: string, params?: unknown[]): Promise<{ rowCount: number | null }>;
}

export interface NotifyInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  jobId?: string | null;
  /**
   * Stable suffix for events that can only happen once. Omit for genuinely
   * repeatable events (each chat message is its own notification).
   */
  once?: string;
}

/** Returns true when a row was actually inserted. */
export const notify = async (
  db: Querier,
  n: NotifyInput,
): Promise<boolean> => {
  // A missing prefs row means "not yet chosen", which is ON — a driver should
  // hear about a new job before they have ever opened the settings screen.
  const { rowCount } = await db.query(
    `INSERT INTO notifications (id, user_id, kind, title, body, job_id)
     SELECT $1, $2, $3, $4, $5, $6
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
    ],
  );
  return (rowCount ?? 0) > 0;
};

export const notifyPooled = (n: NotifyInput): Promise<boolean> =>
  notify({ query: (t, p) => q(t, p) as never }, n);

export type { PoolClient };
