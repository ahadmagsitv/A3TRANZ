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
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/heic', 'application/pdf']);

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

const presignBody = z.object({
  jobId: z.string().min(1).max(64),
  purpose: z.enum(['evidence', 'job_photo', 'defect', 'message', 'attachment']),
  step: z.enum(['pickup', 'load', 'delivery']).optional(),
  slot: z.coerce.number().int().min(0).max(8).optional(),
  contentType: z.string().min(1).max(128),
  contentLength: z.coerce.number().int().positive().max(MAX_BYTES),
});

/** Keys are content-addressed by a random id, never by client-supplied text. */
const keyFor = (b: z.infer<typeof presignBody>): string => {
  const ext = EXT[b.contentType] ?? 'bin';
  const id = randomUUID();
  if (b.purpose === 'evidence') {
    return `jobs/${b.jobId}/evidence/${b.step}/${b.slot}/${id}.${ext}`;
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

    // The caller must actually be on this job before they can put bytes
    // anywhere near it.
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

    const key = keyFor(body);
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
