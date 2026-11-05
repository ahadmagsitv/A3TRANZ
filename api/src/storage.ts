/**
 * Turning a stored key into something a browser or an `<Image>` can load.
 *
 * Bytes live in Cloudinary, not on this server — there is no route here that
 * accepts or serves a file. The client posts to a signed destination and reads
 * from a signed delivery URL; the API only ever handles the key.
 */
import { deliveryUrl } from './cloudinary.ts';
import { HttpError } from './errors.ts';

/**
 * A key a client hands back must be one `/uploads/presign` could have issued
 * for THIS record (uploads.ts keyFor). Without it a driver could fill photo
 * gates with an external URL or another job's evidence, and the server would
 * sign whatever public id it was given.
 */
export const assertOwnKey = (key: string, prefix: string): void => {
  if (!key.startsWith(prefix) || !/^[\w/-]+\.[a-z]{3,4}$/.test(key)) {
    throw new HttpError(400, 'bad_key', 'That upload does not belong to this record.');
  }
};

/**
 * Fixture rows carry absolute URLs (the demo imagery) and real uploads carry
 * Cloudinary public ids; both flow through the same column, so the shape of
 * the value is what decides. Anything already absolute is left alone.
 */
export const publicUrl = (key: string | null | undefined): string | null => {
  if (!key) return null;
  if (/^https?:\/\//.test(key)) return key;
  return deliveryUrl(key);
};
