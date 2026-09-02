const need = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing required env var ${k}`);
  return v;
};

const isProd = process.env.NODE_ENV === 'production';

export const env = {
  databaseUrl: need('DATABASE_URL'),
  port: Number(process.env.PORT ?? 4000),
  /** Sessions last this long; every authenticated request slides the window. */
  sessionDays: Number(process.env.SESSION_DAYS ?? 30),
  /**
   * Object storage for evidence photos and documents.
   *
   * The keys and secret are what let this service hand out presigned URLs, so
   * production refuses to boot without them rather than starting up and
   * signing every upload with a well-known dev credential. Dev points at the
   * MinIO in docker-compose.
   */
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    bucket: process.env.S3_BUCKET ?? 'a3tranz',
    region: process.env.S3_REGION ?? 'us-east-1',
    accessKey: isProd ? need('S3_ACCESS_KEY') : (process.env.S3_ACCESS_KEY ?? 'a3minio'),
    secretKey: isProd ? need('S3_SECRET_KEY') : (process.env.S3_SECRET_KEY ?? 'a3miniosecret'),
  },
  /**
   * Browser origins allowed to call this API.
   *
   * admin-web is served from a different port (and in production a different
   * host), so every request it makes is cross-origin and the browser will not
   * hand back the response without these headers. An allowlist rather than
   * `*`: this API is not public, and `*` would let any page a signed-in user
   * visits read their jobs with a token it tricked out of them.
   */
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),
  isProd,
};
