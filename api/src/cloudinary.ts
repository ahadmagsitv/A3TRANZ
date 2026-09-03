/**
 * Media storage: signed direct upload to Cloudinary.
 *
 * Same shape as the MinIO signer it replaces — the API hands out a signed
 * destination, the client sends the bytes straight there, and only the id
 * comes back through a JSON route. A photo never travels through this server.
 *
 * Cloudinary takes a multipart POST rather than a PUT, and returns the asset
 * under a `public_id` we choose, so the stored key stays exactly what it was.
 */
import { createHash } from 'node:crypto';
import { env } from './env.ts';

/**
 * Cloudinary splits assets by resource type and the delivery URL has to name
 * the right one. Derived from the extension we chose in `keyFor`, so it never
 * needs storing alongside the key.
 */
const resourceType = (key: string): 'image' | 'raw' =>
  key.toLowerCase().endsWith('.pdf') ? 'raw' : 'image';

/** Cloudinary's rule: sorted `k=v` pairs joined by `&`, then the secret. */
const sign = (params: Record<string, string | number>): string =>
  createHash('sha1')
    .update(
      Object.keys(params)
        .sort()
        .map(k => `${k}=${params[k]}`)
        .join('&') + env.cloudinary.apiSecret,
    )
    .digest('hex');

export interface UploadTarget {
  url: string;
  /** Posted as multipart alongside the file itself. */
  fields: Record<string, string>;
}

/**
 * Where the client should POST the bytes.
 *
 * `type: authenticated` — evidence photos are a legal record, and Cloudinary's
 * default delivery is a public URL anyone holding it can open. Authenticated
 * assets are only reachable through a signed URL.
 */
export const signUpload = (key: string): UploadTarget => {
  const timestamp = Math.floor(Date.now() / 1000);
  // Cloudinary appends the format itself, so the public_id must NOT carry the
  // extension — sending `x.png` stored the asset as `x.png.png`.
  const publicId = key.replace(/\.[^./]+$/, '');
  const params = { public_id: publicId, timestamp, type: 'authenticated' };
  return {
    url: `https://api.cloudinary.com/v1_1/${env.cloudinary.cloudName}/${resourceType(key)}/upload`,
    fields: {
      api_key: env.cloudinary.apiKey,
      public_id: publicId,
      timestamp: String(timestamp),
      type: 'authenticated',
      signature: sign(params),
    },
  };
};

/**
 * A delivery URL for a stored asset.
 *
 * ponytail: the signature is stable, so the URL does not expire the way the
 * MinIO presigned GETs did — it is unguessable, not time-limited. Cloudinary's
 * expiring URLs need token-based auth, which is a paid add-on; turn it on there
 * and this becomes a one-line change.
 */
export const deliveryUrl = (key: string): string => {
  const type = resourceType(key);
  // Signed over the delivered path — public id AND extension, no version
  // segment. Derived from a URL Cloudinary generated itself, because the exact
  // string is what the CDN checks.
  const signature = createHash('sha1')
    .update(key + env.cloudinary.deliverySecret)
    .digest('base64url')
    .slice(0, 8);
  return `https://res.cloudinary.com/${env.cloudinary.cloudName}/${type}/authenticated/s--${signature}--/${key}`;
};
