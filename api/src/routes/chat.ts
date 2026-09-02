/**
 * Chat and notification reads.
 *
 * Unread is DERIVED from `thread_reads.last_read_at` against the message
 * timestamps — never a stored counter, which drifts out of sync with the
 * messages it claims to count the first time a write half-fails.
 */
import type { FastifyInstance } from 'fastify';
import {
  NOTIFICATION_ICON,
  type AppNotification,
  type Message,
  type NotificationKind,
  type NotificationPrefs,
  type Thread,
} from '@a3/domain';
import { q } from '../db.ts';
import { publicUrl } from '../storage.ts';
import { authenticate } from '../guard.ts';
import { notFound } from '../errors.ts';
import { COMPANY_TZ, groupLabel, whenLabel } from '../labels.ts';

/** A caller only ever sees threads they are a party to. */
const THREAD_SCOPE = `(t.driver_id = $1 OR t.admin_id = $1)`;

export default async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/chat/threads', async (req, reply) => {
    const me = req.caller.user.id;
    const now = new Date();
    const { rows } = await q<Record<string, any>>(
      `SELECT t.*, j.title AS job_title,
              a.name AS admin_name, a.initials AS admin_initials,
              last.body AS preview, last.created_at AS last_at,
              coalesce(unread.n, 0) AS unread
         FROM threads t
         JOIN jobs  j ON j.id = t.job_id
         JOIN users a ON a.id = t.admin_id
         LEFT JOIN LATERAL (
           SELECT m.body, m.created_at FROM messages m
            WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1
         ) last ON true
         LEFT JOIN LATERAL (
           SELECT count(*) AS n FROM messages m
            LEFT JOIN thread_reads r ON r.thread_id = t.id AND r.user_id = $1
            WHERE m.thread_id = t.id
              AND m.author_id <> $1
              AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
         ) unread ON true
        WHERE ${THREAD_SCOPE}
        ORDER BY last.created_at DESC NULLS LAST`,
      [me],
    );

    const threads: Thread[] = rows.map(t => ({
      id: t.id,
      jobId: t.job_id,
      jobTitle: t.job_title,
      driverId: t.driver_id,
      adminId: t.admin_id,
      adminLabel: `Dispatch — ${String(t.admin_name).split(/\s+/)[0]}`,
      adminInitials: t.admin_initials,
      preview: t.preview ?? '',
      lastMessageAt: t.last_at ? t.last_at.toISOString() : new Date(0).toISOString(),
      whenLabel: t.last_at ? whenLabel(t.last_at, now, COMPANY_TZ) : '',
      unread: Number(t.unread ?? 0),
    }));
    return reply.send({ threads });
  });

  /** The tab carries a dot, not a count (§6.8) — so this is a boolean. */
  app.get('/chat/unread', async (req, reply) => {
    const me = req.caller.user.id;
    const { rows } = await q<{ any: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM threads t
           JOIN messages m ON m.thread_id = t.id
           LEFT JOIN thread_reads r ON r.thread_id = t.id AND r.user_id = $1
          WHERE ${THREAD_SCOPE}
            AND m.author_id <> $1
            AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
       ) AS any`,
      [me],
    );
    return reply.send({ hasUnread: rows[0]?.any ?? false });
  });

  app.get('/chat/threads/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const me = req.caller.user.id;

    const { rows: owns } = await q(
      `SELECT 1 FROM threads t WHERE t.id = $2 AND ${THREAD_SCOPE}`,
      [me, id],
    );
    if (!owns[0]) throw notFound('That conversation could not be found.');

    const now = new Date();
    const { rows } = await q<Record<string, any>>(
      `SELECT * FROM messages WHERE thread_id = $1 ORDER BY created_at`,
      [id],
    );
    // `from` is resolved per-viewer: the same row is 'me' to its author and
    // 'them' to everyone else. Storing it would be wrong for one of them.
    const messages: Message[] = rows.map(m => ({
      id: m.id,
      threadId: m.thread_id,
      from: m.author_id === me ? 'me' : 'them',
      authorId: m.author_id,
      body: m.body,
      at: m.created_at.toISOString(),
      whenLabel: whenLabel(m.created_at, now, COMPANY_TZ),
      attachmentUri: publicUrl(m.attachment_key),
    }));
    return reply.send({ messages });
  });

  // ── notifications ─────────────────────────────────────────────────────────

  app.get('/notifications', async (req, reply) => {
    const now = new Date();
    const { rows } = await q<Record<string, any>>(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.caller.user.id],
    );
    const notifications: AppNotification[] = rows.map(n => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      jobId: n.job_id,
      at: n.created_at.toISOString(),
      group: groupLabel(n.created_at, now, COMPANY_TZ),
      read: n.read_at !== null,
    }));
    return reply.send({ notifications, icons: NOTIFICATION_ICON });
  });

  app.get('/notifications/unread', async (req, reply) => {
    const { rows } = await q<{ n: string }>(
      `SELECT count(*)::text n FROM notifications
        WHERE user_id = $1 AND read_at IS NULL`,
      [req.caller.user.id],
    );
    return reply.send({ count: Number(rows[0]?.n ?? 0) });
  });

  app.get('/notifications/prefs', async (req, reply) => {
    const { rows } = await q<{ kind: NotificationKind; enabled: boolean }>(
      `SELECT kind, enabled FROM notification_prefs WHERE user_id = $1`,
      [req.caller.user.id],
    );
    // A missing row means "not yet chosen", which is on — the driver should
    // hear about a new job before they have visited the settings screen.
    const prefs = Object.fromEntries(
      Object.keys(NOTIFICATION_ICON).map(k => [k, true]),
    ) as NotificationPrefs;
    for (const r of rows) prefs[r.kind] = r.enabled;
    return reply.send({ prefs });
  });
}
