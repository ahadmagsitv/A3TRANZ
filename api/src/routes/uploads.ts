import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EVIDENCE_STEPS } from '@a3/domain';
import { authenticate } from '../guard.ts';
import { HttpError, notFound } from '../errors.ts';
import { q } from '../db.ts';
import { signUpload } from '../cloudinary.ts';
import { threadMember } from './chat.ts';

export const MAX_BYTES = 10 * 1024 * 1024;

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};
const ALLOWED = new Set(Object.keys(EXT));

const presignBody = z.object({
  jobId: z.string().min(1).max(64).optional(),
  threadId: z.string().min(1).max(64).optional(),
  purpose: z.enum(['evidence', 'job_photo', 'defect', 'message', 'attachment']),
  step: z.enum(['pickup', 'load', 'delivery']).optional(),
  slot: z.coerce.number().int().min(0).max(8).optional(),
  contentType: z.string().min(1).max(128),
  contentLength: z.coerce.number().int().positive().max(MAX_BYTES),
});

const keyFor = (b: z.infer<typeof presignBody>, threadId?: string): string => {
  const ext = EXT[b.contentType] ?? 'bin';
  const id = randomUUID();
  if (b.purpose === 'evidence') {
    return `jobs/${b.jobId}/evidence/${b.step}/${b.slot}/${id}.${ext}`;
  }
  if (threadId) {
    return `threads/${threadId}/message/${id}.${ext}`;
  }
  return `jobs/${b.jobId}/${b.purpose}/${id}.${ext}`;
};

export default async function uploadRoutes(app: FastifyInstance): Promise<void> {
  app.post('/uploads/presign', { preHandler: authenticate }, async (req, reply) => {
    const parsed = presignBody.safeParse(req.body);
    if (Number((req.body as { contentLength?: unknown } | null)?.contentLength) > MAX_BYTES) {
      throw new HttpError(413, 'too_large', 'Files must be 10 MB or smaller.');
    }
    if (!parsed.success) {
      throw new HttpError(400, 'bad_request', 'That upload request is not valid.');
    }
    const body = parsed.data;

    if (!ALLOWED.has(body.contentType)) {
      throw new HttpError(415, 'unsupported_type', 'That file type is not accepted.');
    }
    if (body.purpose === 'evidence') {
      if (!body.step || body.slot === undefined) {
        throw new HttpError(400, 'bad_request', 'Evidence needs a step and a slot.');
      }
      if (!EVIDENCE_STEPS.includes(body.step)) {
        throw new HttpError(400, 'bad_request', 'Unknown capture step.');
      }
    }

    if (body.purpose === 'message' && body.threadId) {
      const { rows } = await q(
        `SELECT 1 FROM threads t
          WHERE id = $1 AND ${threadMember('$2')}`,
        [body.threadId, req.caller.user.id],
      );
      if (!rows[0]) throw notFound('That conversation could not be found.');
    } else {
      if (!body.jobId) {
        throw new HttpError(400, 'bad_request', 'That upload needs a job.');
      }
      const { rows } = await q(
        `SELECT 1 FROM jobs j WHERE j.id = $1 AND ($2 OR j.driver_id = $3
           OR EXISTS (SELECT 1 FROM job_legs l WHERE l.job_id = j.id AND l.driver_id = $3))`,
        [body.jobId, req.caller.user.role !== 'driver', req.caller.user.id],
      );
      if (!rows[0]) throw notFound('That job could not be found.');
    }

    const key = keyFor(body, body.purpose === 'message' ? body.threadId : undefined);
    const target = signUpload(key);
    return reply.send({
      key,
      url: target.url,
      fields: target.fields,
      maxBytes: MAX_BYTES,
    });
  });
}
