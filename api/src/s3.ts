/**
 * Presigned S3 URLs, signed here rather than by an SDK.
 *
 * SigV4 query signing is ~50 lines of `node:crypto` against two AWS SDK
 * packages, and this codebase already hand-rolls its KDF and its HMACs. The
 * algorithm is fully determined and verified end-to-end against the real
 * bucket by `writes.test.ts` — if the signature were wrong the PUT would 403,
 * so there is no silent-failure mode to worry about.
 *
 * ponytail: SigV4 by hand. Swap to @aws-sdk/s3-request-presigner the day this
 * needs STS session tokens, multipart uploads, or a non-path-style endpoint.
 */
import { createHash, createHmac } from 'node:crypto';
import { env } from './env.ts';

const SERVICE = 's3';
const ALGO = 'AWS4-HMAC-SHA256';

const sha256 = (v: string): string => createHash('sha256').update(v).digest('hex');
const hmac = (key: Buffer | string, v: string): Buffer =>
  createHmac('sha256', key).update(v).digest();

/** RFC 3986, which is stricter than encodeURIComponent about !'()* */
const uriEncode = (v: string): string =>
  encodeURIComponent(v).replace(
    /[!'()*]/g,
    c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/** Each path segment is encoded, but the slashes between them are not. */
const encodeKey = (key: string): string => key.split('/').map(uriEncode).join('/');

const signingKey = (date: string): Buffer =>
  hmac(hmac(hmac(hmac(`AWS4${env.s3.secretKey}`, date), env.s3.region), SERVICE), 'aws4_request');

/**
 * A presigned URL for one method on one key.
 *
 * `UNSIGNED-PAYLOAD` because the bytes are not here to hash — the client
 * streams them straight to the bucket, which is the entire point of presigning.
 */
const presign = (method: 'PUT' | 'GET', key: string, expiresIn: number): string => {
  const url = new URL(`${env.s3.endpoint}/${env.s3.bucket}/${encodeKey(key)}`);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${env.s3.region}/${SERVICE}/aws4_request`;

  const query: [string, string][] = [
    ['X-Amz-Algorithm', ALGO],
    ['X-Amz-Credential', `${env.s3.accessKey}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresIn)],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  // Canonical query is sorted by encoded key, then value.
  const canonicalQuery = query
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const canonicalRequest = [
    method,
    `/${env.s3.bucket}/${encodeKey(key)}`,
    canonicalQuery,
    `host:${url.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [ALGO, amzDate, scope, sha256(canonicalRequest)].join('\n');
  const signature = hmac(signingKey(date), stringToSign).toString('hex');

  return `${url.origin}/${env.s3.bucket}/${encodeKey(key)}?${canonicalQuery}&X-Amz-Signature=${signature}`;
};

/** 15 minutes: the client PUTs immediately after asking. */
export const presignPut = (key: string): string => presign('PUT', key, 900);

/**
 * 7 days — the S3 maximum, and the right end of the range: these URLs are
 * embedded in a job payload that a screen may sit on for a while, and a photo
 * that 403s after an hour looks like data loss to whoever is reviewing it.
 */
export const presignGet = (key: string): string => presign('GET', key, 604800);
