/**
 * The write half of chat, notes, notification prefs and password change —
 * the `ChatRepo` / `NotificationsRepo` methods Phase 2 left as reads only.
 */
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  AuthError,
  JobStateError,
  NOTIFICATION_ICON,
  type NotificationKind,
} from '@a3/domain';
import { q, tx } from '../db.ts';
import { authenticate, officeOnly } from '../guard.ts';
import { HttpError, notFound } from '../errors.ts';
import { COMPANY_TZ, whenLabel } from '../labels.ts';
import { notify } from '../notify.ts';
import { publish } from '../realtime.ts';
import { hash, verify } from '../password.ts';
import { revokeAllFor } from '../session.ts';

const KINDS = Object.keys(NOTIFICATION_ICON) as NotificationKind[];

export default async function chatWriteRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // ── chat ──────────────────────────────────────────────────────────────────

  /**
   * Start (or find) the thread with a driver.
   *
   * Threads are job-scoped — `threads.job_id` is NOT NULL, and the driver app
   * opens each one from its job (§6.8). So "message this driver" means "message
   * them about a job", and the office picks the most recent one they are on.
   *
   * Idempotent: pressing Message twice must not produce two threads for the
   * same job. There was no way to create one at all before this — threads only
   * came from the seed, so on a real database the inbox could never start.
   */
  app.post('/chat/threads', { preHandler: officeOnly }, async (req, reply) => {
    const parsed = z
      .object({
        driverId: z.string().min(1).max(64),
        /** Optional: defaults to the driver's most recent job. */
        jobId: z.string().min(1).max(64).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'bad_request', 'Pick a driver.', 'driverId');
    const { driverId } = parsed.data;

    const thread = await tx(async c => {
      const { rows: d } = await c.query(
        `SELECT 1 FROM users WHERE id = $1 AND role = 'driver'`,
        [driverId],
      );
      if (!d[0]) throw notFound('That driver could not be found.');

      const { rows: jobs } = await c.query<{ id: string }>(
        parsed.data.jobId
          ? `SELECT id FROM jobs WHERE id = $2 AND driver_id = $1`
          : // Most recent first, and an open job ahead of a closed one: the
            // thing the office wants to talk about is the work in hand.
            `SELECT id FROM jobs
              WHERE driver_id = $1
              ORDER BY (status = 'done'), due_at DESC NULLS LAST
              LIMIT 1`,
        parsed.data.jobId ? [driverId, parsed.data.jobId] : [driverId],
      );
      const jobId = jobs[0]?.id;
      if (!jobId) {
        throw new JobStateError(
          'That driver has no jobs yet. Messages are attached to a job.',
        );
      }

      // One thread per job: the unique index does the deciding, not a read
      // that another request could race.
      await c.query(
        `INSERT INTO threads (id, job_id, driver_id, admin_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (job_id) DO NOTHING`,
        [`THR-${randomUUID()}`, jobId, driverId, req.caller.user.id],
      );
      const { rows } = await c.query<{ id: string }>(
        `SELECT id FROM threads WHERE job_id = $1`,
        [jobId],
      );
      return rows[0]!.id;
    });

    return reply.code(201).send({ threadId: thread });
  });

  app.post('/chat/threads/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        body: z.string().trim().min(1).max(4000),
        attachmentKey: z.string().max(512).nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'bad_request', 'Type a message before sending.');
    }
    const me = req.caller.user.id;

    const message = await tx(async c => {
      const { rows } = await c.query<{
        driver_id: string;
        admin_id: string;
        job_id: string;
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
      }>(
        `INSERT INTO messages (id, thread_id, author_id, body, attachment_key)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at, body, attachment_key`,
        [
          `MSG-${crypto.randomUUID()}`,
          id,
          me,
          parsed.data.body.trim(),
          parsed.data.attachmentKey ?? null,
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
        body: parsed.data.body.trim().slice(0, 140),
        jobId: thread.job_id,
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
        attachmentUri: message.row.attachment_key,
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
