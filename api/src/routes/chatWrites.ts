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
import { assertOwnKey, publicUrl } from '../storage.ts';
import { publish } from '../realtime.ts';
import { jobsOf, threadMember } from './chat.ts';
import { hash, verify } from '../password.ts';
import { revokeAllFor } from '../session.ts';

const KINDS = Object.keys(NOTIFICATION_ICON) as NotificationKind[];

export default async function chatWriteRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.post('/chat/threads', async (req, reply) => {
    const parsed = z
      .object({
        driverId: z.string().min(1).max(64).optional(),
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
        const { rows: j } = await c.query(
          `SELECT 1 WHERE $1 IN (${jobsOf('$2')})`,
          [jobId, driverId],
        );
        if (!j[0]) {
          throw notFound('That job is not assigned to this driver.');
        }
      }

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

      await c.query(
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
          ? `SELECT id FROM threads WHERE job_id = $1`
          : `SELECT id FROM threads WHERE driver_id = $1 AND job_id IS NULL`,
        [jobId ?? driverId],
      );
      return rows[0]!.id;
    });

    return reply.code(201).send({ threadId: thread });
  });

  app.post('/chat/threads/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
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
        `SELECT driver_id, admin_id, job_id FROM threads t
          WHERE id = $1 AND ${threadMember('$2')}`,
        [id, me],
      );
      const thread = rows[0];
      if (!thread) throw notFound('That conversation could not be found.');
      if (attachmentKey) assertOwnKey(attachmentKey, `threads/${id}/message/`);

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

      await c.query(
        `INSERT INTO thread_reads (thread_id, user_id, last_read_at)
         VALUES ($1,$2,now())
         ON CONFLICT (thread_id, user_id) DO UPDATE SET last_read_at = now()`,
        [id, me],
      );

      const { rows: drv } = await c.query<{ id: string }>(
        `SELECT $1::text AS id UNION
         SELECT driver_id FROM jobs WHERE id = $2 AND driver_id IS NOT NULL UNION
         SELECT driver_id FROM job_legs WHERE job_id = $2 AND driver_id IS NOT NULL`,
        [thread.driver_id, thread.job_id],
      );
      const drivers = drv.map(d => d.id);

      const recipients = drivers.includes(me) ? [thread.admin_id] : drivers;
      for (const recipient of recipients) await notify(c, {
        userId: recipient,
        kind: 'message',
        title: 'New message',
        body:
          parsed.data.body.trim().slice(0, 140) ||
          (parsed.data.attachmentName ?? 'Sent an attachment'),
        jobId: thread.job_id,
        threadId: id,
      });

      const { rows: office } = await c.query<{ id: string }>(
        `SELECT id FROM users WHERE role <> 'driver' AND active`,
      );
      return { row: inserted[0]!, thread, drivers, office: office.map(o => o.id) };
    });

    publish([...message.drivers, ...message.office], {
      type: 'message',
      threadId: id,
      authorId: me,
      from: req.caller.user.name,
      preview:
        message.row.body.slice(0, 140) || (message.row.attachment_name ?? 'Sent an attachment'),
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
        attachmentUri: publicUrl(message.row.attachment_key),
        attachmentName: message.row.attachment_name,
        attachmentType: message.row.attachment_type,
      },
    });
  });

  app.post('/chat/threads/:id/read', async (req, reply) => {
    const { id } = req.params as { id: string };
    const me = req.caller.user.id;
    const { rowCount } = await q(
      `INSERT INTO thread_reads (thread_id, user_id, last_read_at)
       SELECT $1, $2, now() FROM threads t
        WHERE t.id = $1 AND ${threadMember('$2')}
       ON CONFLICT (thread_id, user_id) DO UPDATE SET last_read_at = now()`,
      [id, me],
    );
    if (!rowCount) throw notFound('That conversation could not be found.');
    return reply.code(204).send();
  });

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
        `SELECT 1 FROM jobs j WHERE j.id = $1 AND ($2 OR j.driver_id = $3
           OR EXISTS (SELECT 1 FROM job_legs l WHERE l.job_id = j.id AND l.driver_id = $3))`,
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
    await revokeAllFor(req.caller.user.id);

    return reply.send({ ok: true, signedOutEverywhere: true });
  });
}
