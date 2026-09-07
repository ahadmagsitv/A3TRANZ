/**
 * The write half of chat, notes, notification prefs and password change —
 * the `ChatRepo` / `NotificationsRepo` methods Phase 2 left as reads only.
 */
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  AuthError,
  NOTIFICATION_ICON,
  type NotificationKind,
} from '@a3/domain';
import { q, tx } from '../db.ts';
import { authenticate } from '../guard.ts';
import { HttpError, notFound } from '../errors.ts';
import { COMPANY_TZ, whenLabel } from '../labels.ts';
import { notify } from '../notify.ts';
import { publicUrl } from '../storage.ts';
import { publish } from '../realtime.ts';
import { hash, verify } from '../password.ts';
import { revokeAllFor } from '../session.ts';

const KINDS = Object.keys(NOTIFICATION_ICON) as NotificationKind[];

export default async function chatWriteRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // ── chat ──────────────────────────────────────────────────────────────────

  /**
   * Start (or find) a thread with a driver.
   *
   * Two kinds, and which one you get is EXPLICIT, never guessed:
   *   - `{ driverId, jobId }` → the thread about that job.
   *   - `{ driverId }`        → the direct thread (job_id NULL), one per driver.
   *
   * It used to fall back to "their most recent job" when no jobId was given,
   * which is how a note about a licence renewal ended up in the middle of a
   * container run, and how a driver with no jobs could not be messaged at all.
   *
   * Either side may open one. The office picks the driver; a driver may only
   * open their own, and only on a job that is theirs — so the phone's Message
   * button works on a job nobody has written to yet instead of doing nothing.
   *
   * Idempotent in both shapes: the partial unique indexes do the deciding, not
   * a read another request could race, so pressing Message twice cannot fork
   * the conversation.
   */
  app.post('/chat/threads', async (req, reply) => {
    const parsed = z
      .object({
        /** Ignored for a driver caller — they can only open their own. */
        driverId: z.string().min(1).max(64).optional(),
        /** Omitted means the direct thread — NOT "pick a job for me". */
        jobId: z.string().min(1).max(64).nullish(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'bad_request', 'Pick a driver.', 'driverId');

    const me = req.caller.user;
    const isDriver = me.role === 'driver';
    const driverId = isDriver ? me.id : parsed.data.driverId;
    if (!driverId) {
      throw new HttpError(400, 'bad_request', 'Pick a driver.', 'driverId');
    }
    const jobId = parsed.data.jobId ?? null;

    const thread = await tx(async c => {
      const { rows: d } = await c.query(
        `SELECT 1 FROM users WHERE id = $1 AND role = 'driver'`,
        [driverId],
      );
      if (!d[0]) throw notFound('That driver could not be found.');

      if (jobId) {
        // The job has to be theirs, or the thread would be a conversation
        // between an admin and a driver about someone else's work — and for a
        // driver caller this is also the authorization check.
        const { rows: j } = await c.query(
          `SELECT 1 FROM jobs WHERE id = $1 AND driver_id = $2`,
          [jobId, driverId],
        );
        if (!j[0]) {
          throw notFound('That job is not assigned to this driver.');
        }
      }

      // Who the office end of the thread belongs to. An admin opening it is
      // that person; a driver opening it has to be handed to someone, so it
      // goes to whoever is already talking to them, and otherwise to the
      // longest-standing active admin.
      //
      // ponytail: threads are scoped to ONE admin (THREAD_SCOPE), so a
      // driver-opened thread is only visible to the one picked here. Give the
      // office a shared inbox — scope by role rather than by admin_id — the
      // day dispatch is more than one person deep.
      let adminId = me.id;
      if (isDriver) {
        const { rows: a } = await c.query<{ id: string }>(
          `SELECT id FROM (
             SELECT u.id, 0 AS rank, max(t.created_at) AS at
               FROM threads t JOIN users u ON u.id = t.admin_id
              WHERE t.driver_id = $1 AND u.active
              GROUP BY u.id
             UNION ALL
             SELECT u.id, 1, u.created_at
               FROM users u
              WHERE u.role <> 'driver' AND u.active
           ) pick ORDER BY rank, at DESC LIMIT 1`,
          [driverId],
        );
        const picked = a[0]?.id;
        if (!picked) {
          throw notFound('There is nobody in the office to message right now.');
        }
        adminId = picked;
      }

      // ON CONFLICT names the partial index that applies, so each kind is
      // idempotent against its own uniqueness rule and neither can collide
      // with the other.
      await c.query(
        // `$2::text` because the direct branch binds NULL, and an untyped
        // NULL parameter is one Postgres refuses to infer a type for.
        `INSERT INTO threads (id, job_id, driver_id, admin_id)
         VALUES ($1, $2::text, $3, $4)
         ${
           jobId
             ? 'ON CONFLICT (job_id) WHERE job_id IS NOT NULL DO NOTHING'
             : 'ON CONFLICT (driver_id) WHERE job_id IS NULL DO NOTHING'
         }`,
        [`THR-${randomUUID()}`, jobId, driverId, adminId],
      );
      const { rows } = await c.query<{ id: string }>(
        jobId
          ? `SELECT id FROM threads WHERE driver_id = $1 AND job_id = $2`
          : `SELECT id FROM threads WHERE driver_id = $1 AND job_id IS NULL`,
        jobId ? [driverId, jobId] : [driverId],
      );
      return rows[0]!.id;
    });

    return reply.code(201).send({ threadId: thread });
  });

  app.post('/chat/threads/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        // Empty is allowed WITH an attachment: a photo on its own is a
        // message. The pair is what must not be empty, checked below.
        body: z.string().trim().max(4000),
        attachmentKey: z.string().max(512).nullable().optional(),
        attachmentName: z.string().trim().max(255).nullable().optional(),
        attachmentType: z.string().trim().max(128).nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'bad_request', 'Type a message before sending.');
    }
    const attachmentKey = parsed.data.attachmentKey ?? null;
    if (parsed.data.body.length === 0 && !attachmentKey) {
      throw new HttpError(400, 'bad_request', 'Type a message before sending.');
    }
    const me = req.caller.user.id;

    const message = await tx(async c => {
      const { rows } = await c.query<{
        driver_id: string;
        admin_id: string;
        job_id: string | null;
      }>(
        `SELECT driver_id, admin_id, job_id FROM threads
          WHERE id = $1 AND (driver_id = $2 OR admin_id = $2)`,
        [id, me],
      );
      const thread = rows[0];
      if (!thread) throw notFound('That conversation could not be found.');

      const { rows: inserted } = await c.query<{
        id: string;
        created_at: Date;
        body: string;
        attachment_key: string | null;
        attachment_name: string | null;
        attachment_type: string | null;
      }>(
        `INSERT INTO messages
           (id, thread_id, author_id, body, attachment_key, attachment_name,
            attachment_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, created_at, body, attachment_key, attachment_name,
                   attachment_type`,
        [
          `MSG-${crypto.randomUUID()}`,
          id,
          me,
          parsed.data.body.trim(),
          attachmentKey,
          attachmentKey ? parsed.data.attachmentName ?? 'attachment' : null,
          attachmentKey ? parsed.data.attachmentType ?? null : null,
        ],
      );

      // Sending marks it read for the sender — their own message must not come
      // back as an unread dot on their own tab.
      await c.query(
        `INSERT INTO thread_reads (thread_id, user_id, last_read_at)
         VALUES ($1,$2,now())
         ON CONFLICT (thread_id, user_id) DO UPDATE SET last_read_at = now()`,
        [id, me],
      );

      // §6.8 `message`. Each message is its own notification, so no `once` key.
      const recipient = me === thread.driver_id ? thread.admin_id : thread.driver_id;
      await notify(c, {
        userId: recipient,
        kind: 'message',
        title: 'New message',
        // A photo with no caption still has to say something on the phone.
        body:
          parsed.data.body.trim().slice(0, 140) ||
          (parsed.data.attachmentName ?? 'Sent an attachment'),
        // Null on a direct thread — which is why the tap routes by threadId.
        jobId: thread.job_id,
        threadId: id,
      });

      return { row: inserted[0]!, thread };
    });

    // Nudge the other party (and this user's other devices). After the commit,
    // so nobody is told to refetch something that then rolls back.
    publish([message.thread.driver_id, message.thread.admin_id], {
      type: 'message',
      threadId: id,
    });

    const now = new Date();
    return reply.code(201).send({
      message: {
        id: message.row.id,
        threadId: id,
        from: 'me',
        authorId: me,
        body: message.row.body,
        at: message.row.created_at.toISOString(),
        whenLabel: whenLabel(message.row.created_at, now, COMPANY_TZ),
        // `publicUrl`, not the raw key: the sender's own bubble rendered a
        // broken image because this one handed back a Cloudinary id where
        // every other read hands back a URL.
        attachmentUri: publicUrl(message.row.attachment_key),
        attachmentName: message.row.attachment_name,
        attachmentType: message.row.attachment_type,
      },
    });
  });

  /** Opening a thread clears its unread flag, which recomputes the tab dot. */
  app.post('/chat/threads/:id/read', async (req, reply) => {
    const { id } = req.params as { id: string };
    const me = req.caller.user.id;
    const { rowCount } = await q(
      `INSERT INTO thread_reads (thread_id, user_id, last_read_at)
       SELECT $1, $2, now() FROM threads t
        WHERE t.id = $1 AND (t.driver_id = $2 OR t.admin_id = $2)
       ON CONFLICT (thread_id, user_id) DO UPDATE SET last_read_at = now()`,
      [id, me],
    );
    if (!rowCount) throw notFound('That conversation could not be found.');
    return reply.code(204).send();
  });

  /** M13 job notes — same compose bar as chat, different stream. */
  app.post('/jobs/:id/notes', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({ body: z.string().trim().min(1).max(4000) })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'bad_request', 'Write a note before saving.');
    }
    const me = req.caller.user;

    const note = await tx(async c => {
      const { rows } = await c.query(
        `SELECT 1 FROM jobs WHERE id = $1 AND ($2 OR driver_id = $3)`,
        [id, me.role !== 'driver', me.id],
      );
      if (!rows[0]) throw notFound('That job could not be found.');

      const { rows: ins } = await c.query<{ id: string; created_at: Date }>(
        `INSERT INTO job_notes (id, job_id, author_id, body)
         VALUES ($1,$2,$3,$4) RETURNING id, created_at`,
        [`NTE-${crypto.randomUUID()}`, id, me.id, parsed.data.body.trim()],
      );
      return ins[0]!;
    });

    const now = new Date();
    return reply.code(201).send({
      note: {
        id: note.id,
        jobId: id,
        authorId: me.id,
        authorName: me.name,
        initials: me.initials,
        at: note.created_at.toISOString(),
        whenLabel: whenLabel(note.created_at, now, COMPANY_TZ),
        body: parsed.data.body.trim(),
      },
    });
  });

  // ── notifications ─────────────────────────────────────────────────────────

  /**
   * Where to push. The device registers its FCM token after sign-in and drops
   * it on sign-out.
   *
   * The token is the primary key, so re-registering one that belonged to
   * another account moves it: a shared phone must not keep buzzing for the
   * driver who used it yesterday.
   */
  app.post('/notifications/device', async (req, reply) => {
    const parsed = z
      .object({
        token: z.string().trim().min(1).max(512),
        platform: z.enum(['ios', 'android']),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'bad_request', 'Invalid device token.');

    await q(
      `INSERT INTO device_tokens (token, user_id, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE
         SET user_id = excluded.user_id, last_seen_at = now()`,
      [parsed.data.token, req.caller.user.id, parsed.data.platform],
    );
    return reply.code(204).send();
  });

  /** Signing out stops the pushes for that device, not for the account. */
  app.delete('/notifications/device/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    await q(`DELETE FROM device_tokens WHERE token = $1 AND user_id = $2`, [
      token,
      req.caller.user.id,
    ]);
    return reply.code(204).send();
  });

  app.post('/notifications/:id/read', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rowCount } = await q(
      `UPDATE notifications SET read_at = now()
        WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
      [id, req.caller.user.id],
    );
    // Already read is success, not a 404: the client should not have to care
    // whether it got there first.
    if (!rowCount) {
      const { rows } = await q(
        `SELECT 1 FROM notifications WHERE id = $1 AND user_id = $2`,
        [id, req.caller.user.id],
      );
      if (!rows[0]) throw notFound();
    }
    return reply.code(204).send();
  });

  app.post('/notifications/read-all', async (req, reply) => {
    await q(
      `UPDATE notifications SET read_at = now()
        WHERE user_id = $1 AND read_at IS NULL`,
      [req.caller.user.id],
    );
    return reply.code(204).send();
  });

  /** M14 Notification settings — one on/off per §6.8 driver trigger. */
  app.put('/notifications/prefs/:kind', async (req, reply) => {
    const { kind } = req.params as { kind: string };
    if (!KINDS.includes(kind as NotificationKind)) {
      throw notFound('That notification type does not exist.');
    }
    const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'bad_request', 'On or off?');

    await q(
      `INSERT INTO notification_prefs (user_id, kind, enabled)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id, kind) DO UPDATE SET enabled = EXCLUDED.enabled`,
      [req.caller.user.id, kind, parsed.data.enabled],
    );
    return reply.send({ kind, enabled: parsed.data.enabled });
  });

  // ── M16 change password ───────────────────────────────────────────────────

  app.post('/auth/change-password', async (req, reply) => {
    const parsed = z
      .object({
        current: z.string().min(1).max(200),
        next: z.string().min(1).max(200),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new AuthError('password_too_short', 'Enter both passwords.', 'password');
    }
    const { current, next } = parsed.data;

    if (next.length < 8) {
      throw new AuthError(
        'password_too_short',
        'Your new password needs at least 8 characters.',
        'password',
      );
    }

    const { rows } = await q<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = $1`,
      [req.caller.user.id],
    );
    const stored = rows[0]?.password_hash;
    if (!stored || !(await verify(current, stored))) {
      throw new AuthError(
        'invalid_credentials',
        'That is not your current password.',
        'password',
      );
    }

    await q(`UPDATE users SET password_hash = $2 WHERE id = $1`, [
      req.caller.user.id,
      await hash(next),
    ]);
    // Changing a password logs out every OTHER device — the usual reason to
    // change one is that someone else may have it.
    await revokeAllFor(req.caller.user.id);

    return reply.send({ ok: true, signedOutEverywhere: true });
  });
}
