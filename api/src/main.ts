import { build } from './server.ts';
import { env } from './env.ts';
import { startWorker } from './worker.ts';

const app = build();

const stopWorker = startWorker();

app.addHook('onClose', async () => stopWorker());

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.close().then(() => process.exit(0), () => process.exit(1));
  });
}

app.listen({ port: env.port, host: '0.0.0.0' }).then(
  () => console.log(`api listening on :${env.port} (worker running)`),
  (err: unknown) => {
    console.error('api failed to start:', err);
    process.exit(1);
  },
);
