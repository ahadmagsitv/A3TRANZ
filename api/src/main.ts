/**
 * The entry point. Its only job is to listen.
 *
 * Two things here are deliberate, and both were learned by this file failing
 * silently under PM2:
 *
 * 1. No `import.meta.filename === process.argv[1]` guard. That used to live at
 *    the bottom of server.ts so tests could `build()` without a port, but a
 *    process manager gives no reliable answer to "am I the main module?" —
 *    PM2's fork mode loads the script from its own wrapper, so argv[1] is
 *    PM2's file. The API booted and never called listen().
 *
 * 2. No top-level `await`. PM2's fork container loads the target with
 *    `require()`, and `require()` refuses an ESM graph containing top-level
 *    await (ERR_REQUIRE_ASYNC_MODULE). The whole module then fails to load.
 *
 * Tests import `build()` from server.ts and never touch this file, which is
 * the reason the guard existed in the first place.
 */
import { build } from './server.ts';
import { env } from './env.ts';
import { startWorker } from './worker.ts';

const app = build();

// In-process: two periodic jobs do not justify a second thing to deploy.
// Tests drive `runOnce()` directly instead, so they never race the timer.
const stopWorker = startWorker();

// Registered BEFORE listen: Fastify refuses addHook on a started instance.
app.addHook('onClose', async () => stopWorker());

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.close().then(() => process.exit(0), () => process.exit(1));
  });
}

app.listen({ port: env.port, host: '0.0.0.0' }).then(
  () => console.log(`api listening on :${env.port} (worker running)`),
  (err: unknown) => {
    // Loudly, and on stderr. A bind failure that printed nothing is exactly
    // how this stayed a mystery: pm2 said `online` with an empty out log.
    console.error('api failed to start:', err);
    process.exit(1);
  },
);
