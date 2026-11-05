const need = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing required env var ${k}`);
  return v;
};

const isProd = process.env.NODE_ENV === 'production';

export const env = {
  databaseUrl: need('DATABASE_URL'),
  port: Number(process.env.PORT ?? 4000),
  sessionDays: Number(process.env.SESSION_DAYS ?? 30),
  cloudinary: {
    cloudName: isProd ? need('CLOUDINARY_CLOUD_NAME') : (process.env.CLOUDINARY_CLOUD_NAME ?? ''),
    apiKey: isProd ? need('CLOUDINARY_API_KEY') : (process.env.CLOUDINARY_API_KEY ?? ''),
    apiSecret: isProd ? need('CLOUDINARY_API_SECRET') : (process.env.CLOUDINARY_API_SECRET ?? ''),
    deliverySecret:
      process.env.CLOUDINARY_DELIVERY_SECRET ?? process.env.CLOUDINARY_API_SECRET ?? '',
  },

  corsOrigins: (process.env.CORS_ORIGINS ?? 'https://admin.a3tranz.appcrops.com,http://31.97.99.190:3000,http://localhost:3000')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),
  fcmCredentials: process.env.FCM_CREDENTIALS ?? '',
  isProd,
};
