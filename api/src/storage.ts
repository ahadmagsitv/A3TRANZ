/**
 * Turning a stored key into something a browser or an `<Image>` can load.
 *
 * Bytes live in object storage, not on this server — there is no route here
 * that accepts or serves a file. The client PUTs to a presigned URL and reads
 * from a presigned URL; the API only ever handles the key.
 */
import { presignGet } from './s3.ts';

/**
 * Fixture rows carry absolute URLs (the demo imagery) and real uploads carry
 * bucket keys; both flow through the same column, so the shape of the value is
 * what decides. Anything already absolute is left alone.
 */
export const publicUrl = (key: string | null | undefined): string | null => {
  if (!key) return null;
  if (/^https?:\/\//.test(key)) return key;
  return presignGet(key);
};
