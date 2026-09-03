/**
 * The entry point. Its only job is to listen.
 *
 * This used to be an `import.meta.filename === process.argv[1]` guard at the
 * bottom of server.ts, so that tests could `build()` without binding a port.
 * That question has no reliable answer under a process manager: PM2's fork
 * mode imports the script from its own wrapper, which makes `argv[1]` PM2's
 * file, not this one. The API came up, logged its startup warnings, and
 * silently never called listen() — `pm2 status` said online and every request
 * was refused.
 *
 * Tests import `build()` from server.ts and never touch this file, which is
 * the whole reason the guard existed.
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

await app.listen({ port: env.port, host: '0.0.0.0' });
console.log(`api listening on :${env.port} (worker running)`);
