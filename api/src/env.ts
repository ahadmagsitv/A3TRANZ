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
   * Cloudinary — where evidence photos and documents live.
   *
   * Required in production: without real credentials the API would hand out
   * signatures nothing accepts, and every upload would fail at the client
   * with no clue why.
   */
  cloudinary: {
    cloudName: isProd ? need('CLOUDINARY_CLOUD_NAME') : (process.env.CLOUDINARY_CLOUD_NAME ?? ''),
    apiKey: isProd ? need('CLOUDINARY_API_KEY') : (process.env.CLOUDINARY_API_KEY ?? ''),
    apiSecret: isProd ? need('CLOUDINARY_API_SECRET') : (process.env.CLOUDINARY_API_SECRET ?? ''),
    /**
     * Delivery URLs are validated against the account's PRIMARY secret, not
     * whichever key signed the upload — verified against a URL Cloudinary
     * generated itself. Defaults to the upload secret for accounts where they
     * are the same key.
     */
    deliverySecret:
      process.env.CLOUDINARY_DELIVERY_SECRET ?? process.env.CLOUDINARY_API_SECRET ?? '',
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
  /**
   * Path to the Firebase service-account JSON used to sign push messages.
   *
   * A path, not the JSON itself: it is a private key, and the repository is
   * public. Unset simply means no push — the notification row is still
   * written and the Alerts tab still shows it.
   */
  fcmCredentials: process.env.FCM_CREDENTIALS ?? '',
  isProd,
};
