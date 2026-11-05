import { createHash } from 'node:crypto';
import { env } from './env.ts';

const IMAGE_EXT = /\.(jpg|jpeg|png|heic|webp|gif)$/i;
const resourceType = (key: string): 'image' | 'raw' =>
  IMAGE_EXT.test(key) ? 'image' : 'raw';

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
  fields: Record<string, string>;
}

export const signUpload = (key: string): UploadTarget => {
  const timestamp = Math.floor(Date.now() / 1000);
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

export const deliveryUrl = (key: string): string => {
  const type = resourceType(key);
  const signature = createHash('sha1')
    .update(key + env.cloudinary.deliverySecret)
    .digest('base64url')
    .slice(0, 8);
  return `https://res.cloudinary.com/${env.cloudinary.cloudName}/${type}/authenticated/s--${signature}--/${key}`;
};
