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
  const inserted = (rowCount ?? 0) > 0;

  // Push only on a real insert. That single condition is what makes the
  // driver's mute switch and the `once` idempotency apply to push too — a
  // muted trigger writes no row and therefore sends nothing, and a retried
  // request cannot buzz the phone twice.
  //
  // Not awaited: the caller is usually inside a transaction, and Firebase
  // should never be on the critical path of a database write.
  if (inserted) {
    void push({
      userId: n.userId,
      title: n.title,
      body: n.body,
      // Strings only (FCM's rule). The app reads these on tap to open the
      // right screen.
      data: {
        kind: n.kind,
        ...(n.jobId ? { jobId: n.jobId } : {}),
      },
    }).catch(() => {
      // Already swallowed inside `push`; this is belt and braces so an
      // unhandled rejection can never take the process down.
    });
  }

  return inserted;
};

export const notifyPooled = (n: NotifyInput): Promise<boolean> =>
  notify({ query: (t, p) => q(t, p) as never }, n);

/**
 * Who to tell when a job's driver may have changed.
 *
 * Three routes can move a job between drivers — create, edit and /assign — and
 * each had its own idea of what to send. The edit route sent nothing at all,
 * which is the route the job form actually uses (it derives the owner from the
 * pickup leg rather than a separate field), so an assignment made by editing a
 * job never reached the phone. One function so the next route cannot forget
 * half of it.
 *
 * No `once` key: a job can change hands repeatedly and each move is a separate
 * thing the driver has to act on.
 */
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
  // The driver taken off it otherwise keeps a job in their list that is no
  // longer theirs, and never hears why.
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
