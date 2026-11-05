import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { env } from './env.ts';
import { resolve } from './session.ts';
import { addSocket, removeSocket } from './realtime.ts';
import { HttpError, send } from './errors.ts';
import { pool } from './db.ts';
import authRoutes from './routes/auth.ts';
import jobRoutes from './routes/jobs.ts';
import peopleRoutes from './routes/people.ts';
import chatRoutes from './routes/chat.ts';
import payrollRoutes from './routes/payroll.ts';
import driverJobRoutes from './routes/driverJobs.ts';
import uploadRoutes from './routes/uploads.ts';
import adminJobRoutes from './routes/adminJobs.ts';
import adminPeopleRoutes from './routes/adminPeople.ts';
import chatWriteRoutes from './routes/chatWrites.ts';

export const build = () => {
  const app = Fastify({
    logger: {
      level: env.isProd ? 'info' : 'warn',
      serializers: { req: r => ({ method: r.method, url: r.url.split('?')[0], remoteAddress: r.ip }) },
    },
    trustProxy: process.env.TRUST_PROXY ?? '127.0.0.1',
  });

  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (origin && env.corsOrigins.includes(origin)) {
      reply.header('access-control-allow-origin', origin);
      reply.header('vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      return reply
        .header('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
        .header('access-control-allow-headers', 'authorization,content-type')
        .header('access-control-max-age', '86400')
        .code(204)
        .send();
    }
  });

  app.setErrorHandler((err, _req, reply) => send(reply, err));

  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      const text = (body as string).trim();
      if (text.length === 0) return done(null, {});
      try {
        done(null, JSON.parse(text));
      } catch {
        done(new HttpError(400, 'bad_json', 'That request body is not valid JSON.'), undefined);
      }
    },
  );

  app.get('/health', async () => {
    await pool.query('SELECT 1');
    return { ok: true };
  });

  app.get('/public/stats', async () => {
    const { rows: [row] } = await pool.query<{ drivers: string; jobs: string }>(
      `SELECT
         (SELECT count(*) FROM users WHERE role = 'driver' AND active)::text AS drivers,
         (SELECT count(*) FROM jobs
           WHERE assigned_at >= date_trunc('month', now()))::text  AS jobs`,
    );
    return { activeDrivers: Number(row?.drivers ?? 0), jobsThisMonth: Number(row?.jobs ?? 0) };
  });

  app.register(async instance => {
    await instance.register(websocket);

    instance.get('/realtime', { websocket: true }, async (socket, req) => {
      const token = (req.query as { token?: string } | undefined)?.token;
      let caller;
      try {
        caller = await resolve(token);
      } catch {
        socket.close(1008, 'unauthorized');
        return;
      }
      const userId = caller.user.id;
      addSocket(userId, socket);
      socket.on('close', () => removeSocket(userId, socket));
      socket.on('error', () => removeSocket(userId, socket));
    });
  });

  app.register(authRoutes);
  app.register(jobRoutes);
  app.register(peopleRoutes);
  app.register(chatRoutes);
  app.register(payrollRoutes);
  app.register(driverJobRoutes);
  app.register(uploadRoutes);
  app.register(adminJobRoutes);
  app.register(adminPeopleRoutes);
  app.register(chatWriteRoutes);
  return app;
};
