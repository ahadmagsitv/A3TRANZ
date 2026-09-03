/**
 * PM2 process file — the Fastify API and the Next admin console.
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup     # survive a reboot
 *
 * FIRST TIME ON THE SERVER, in this order:
 *
 *   npm ci                      # at the REPO ROOT — api is a workspace and
 *                               # resolves @a3/domain from the root tree
 *   cd api && npm run migrate
 *   cd admin-web && npm ci && NEXT_PUBLIC_API_URL=https://api.example.com npm run build
 *
 * NEXT_PUBLIC_API_URL is inlined into the browser bundle at BUILD time — it is
 * not read at runtime, so putting it in `env` below would do nothing. It has
 * to be set on the build command, and the site has to be rebuilt to change it.
 *
 * `.cjs`, not `.js`: PM2 loads this with `require`, and the extension keeps
 * that true even if the root package.json ever gains `"type": "module"`.
 */
const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'a3tranz-api',
      cwd: path.join(__dirname, 'api'),
      // Node runs the TypeScript directly — the same flags as `npm start`.
      // PM2 owns the node process rather than an npm wrapper, so restarts and
      // signals reach the server itself.
      //
      // main.ts, not server.ts: server.ts only exports build(). PM2's fork
      // mode imports the script from its own wrapper, so anything keyed on
      // "am I the main module?" is false here — which is how the API once ran
      // as `online` while never binding a port.
      script: 'src/main.ts',
      interpreter: 'node',
      interpreter_args: '--env-file-if-exists=.env --experimental-strip-types',

      // fork, one instance, deliberately. `realtime.ts` holds its WebSocket
      // clients in a module-level map and `startWorker()` runs in-process, so
      // a second instance would strand half the live connections and run every
      // periodic sweep twice. Cluster only after the socket hub moves to Redis
      // (or LISTEN/NOTIFY) and the worker moves out of the API.
      exec_mode: 'fork',
      instances: 1,

      env: {
        NODE_ENV: 'production',
        PORT: 4001,
        // Everything else — DATABASE_URL, CLOUDINARY_*, FCM_CREDENTIALS — comes
        // from api/.env, which `--env-file-if-exists` loads. Secrets stay off
        // this file because it is committed to a public repo.
        //
        // CORS_ORIGINS must list the admin console's real origin or every
        // browser request fails the preflight.
      },

      max_memory_restart: '512M',
      // A crash loop (bad DATABASE_URL, Postgres still booting) should back off
      // rather than hammer the database.
      exp_backoff_restart_delay: 200,
      time: true,
    },
    {
      name: 'a3tranz-admin',
      cwd: path.join(__dirname, 'admin-web'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      exec_mode: 'fork',
      instances: 1,
      env: { NODE_ENV: 'production' },
      max_memory_restart: '512M',
      time: true,
    },
  ],
};
