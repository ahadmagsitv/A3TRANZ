import { deliveryUrl } from './cloudinary.ts';
import { HttpError } from './errors.ts';

export const assertOwnKey = (key: string, prefix: string): void => {
  if (!key.startsWith(prefix) || !/^[\w/-]+\.[a-z]{3,4}$/.test(key)) {
    throw new HttpError(400, 'bad_key', 'That upload does not belong to this record.');
  }
};

export const publicUrl = (key: string | null | undefined): string | null => {
  if (!key) return null;
  if (/^https?:\/\//.test(key)) return key;
  return deliveryUrl(key);
};
