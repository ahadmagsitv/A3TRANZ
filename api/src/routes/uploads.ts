/**
 * Upload handoff.
 *
 * The client asks for a destination, PUTs the bytes there, then hands the
 * returned KEY to `capturePhoto`. Photo bytes never pass through a JSON route.
 *
 * The server chooses the key — the client never does, and never receives
 * blanket write access to the bucket. In dev the destination is this API
 * writing to a local directory; in production it becomes a real S3 presigned
 * PUT. The client code is identical either way: it PUTs to whatever URL it was
 * handed. That is why there is no storage interface here: replacing the URL
 * this route hands back, and deleting the dev receiver below, is the whole
 * migration.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EVIDENCE_STEPS } from '@a3/domain';
import { authenticate } from '../guard.ts';
import { HttpError, forbidden, notFound } from '../errors.ts';
import { q } from '../db.ts';
import { signUpload } from '../cloudinary.ts';

export const MAX_BYTES = 12 * 1024 * 1024;

/**
 * What may be uploaded, and what it is called on disk.
 *
 * A WHITELIST, deliberately: the extension is chosen here from the declared
 * type, never taken from the client's filename, so an `invoice.pdf.exe` cannot
 * name itself. Anything not listed is refused rather than stored as `.bin`.
 */
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
  /** Required for everything except a message, which may have no job at all. */
  jobId: z.string().min(1).max(64).optional(),
  /** `message` only — a direct thread has no job to hang the file off. */
  threadId: z.string().min(1).max(64).optional(),
  purpose: z.enum(['evidence', 'job_photo', 'defect', 'message', 'attachment']),
  step: z.enum(['pickup', 'load', 'delivery']).optional(),
  slot: z.coerce.number().int().min(0).max(8).optional(),
  contentType: z.string().min(1).max(128),
  contentLength: z.coerce.number().int().positive().max(MAX_BYTES),
});

/** Keys are content-addressed by a random id, never by client-supplied text. */
const keyFor = (b: z.infer<typeof presignBody>, threadId?: string): string => {
  const ext = EXT[b.contentType] ?? 'bin';
  const id = randomUUID();
  if (b.purpose === 'evidence') {
    return `jobs/${b.jobId}/evidence/${b.step}/${b.slot}/${id}.${ext}`;
  }
  // A message belongs to its THREAD. Filing it under a job would leave the
  // direct thread — which has no job — with nowhere to put anything.
  if (threadId) {
    return `threads/${threadId}/message/${id}.${ext}`;
  }
  return `jobs/${b.jobId}/${b.purpose}/${id}.${ext}`;
};


export default async function uploadRoutes(app: FastifyInstance): Promise<void> {
  app.post('/uploads/presign', { preHandler: authenticate }, async (req, reply) => {
    const parsed = presignBody.safeParse(req.body);
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

    // Whatever it is attached to, the caller must be on it before they can put
    // bytes anywhere near it.
    if (body.purpose === 'message' && body.threadId) {
      const { rows } = await q(
        `SELECT 1 FROM threads
          WHERE id = $1 AND (driver_id = $2 OR admin_id = $2)`,
        [body.threadId, req.caller.user.id],
      );
      if (!rows[0]) throw notFound('That conversation could not be found.');
    } else {
      if (!body.jobId) {
        throw new HttpError(400, 'bad_request', 'That upload needs a job.');
      }
      const { rows } = await q<{ driver_id: string | null }>(
        'SELECT driver_id FROM jobs WHERE id = $1',
        [body.jobId],
      );
      if (!rows[0]) throw notFound('That job could not be found.');
      if (
        req.caller.user.role === 'driver' &&
        rows[0].driver_id !== req.caller.user.id
      ) {
        throw notFound('That job could not be found.');
      }
    }

    const key = keyFor(body, body.purpose === 'message' ? body.threadId : undefined);
    const target = signUpload(key);
    return reply.send({
      key,
      // Where to PUT. Absolute so the client treats it as opaque — which is
      // what makes the S3 swap invisible to it.
      // `req.host`, not `req.hostname`: Fastify 5 strips the port from the
      // latter, which yields a URL the client cannot reach on any deployment
      // not served from :80.
      // Cloudinary takes a multipart POST, not a PUT: the client sends these
      // fields alongside the file. The key is still ours, so nothing
      // downstream changes.
      url: target.url,
      fields: target.fields,
      maxBytes: MAX_BYTES,
    });
  });
}
