/**
 * Turning a stored key into something a browser or an `<Image>` can load.
 *
 * Bytes live in Cloudinary, not on this server — there is no route here that
 * accepts or serves a file. The client posts to a signed destination and reads
 * from a signed delivery URL; the API only ever handles the key.
 */
import { deliveryUrl } from './cloudinary.ts';

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
