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
    logger: env.isProd ? true : { transport: undefined, level: 'warn' },
    trustProxy: true,
  });

  /**
   * CORS. The browser sends a preflight OPTIONS for anything carrying a JSON
   * body or an Authorization header, and refuses the real request unless that
   * preflight answers. Without this the API 404'd the preflight and admin-web
   * reported "cannot reach the server" against a server that was running.
   *
   * No `Allow-Credentials`: the session travels in the Authorization header,
   * not a cookie, so the browser never needs to attach credentials and this
   * cannot become a cookie-forwarding hole.
   */
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (origin && env.corsOrigins.includes(origin)) {
      reply.header('access-control-allow-origin', origin);
      // The response varies by origin; without this a shared cache could hand
      // one origin's response to another.
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

  // One error shape for every route — see errors.ts.
  app.setErrorHandler((err, _req, reply) => send(reply, err));

  // Several routes take no body at all (approve, submit, logout, deactivate).
  // Fastify's default JSON parser rejects an empty body outright, so a client
  // that sets `content-type: application/json` out of habit gets a parse error
  // on a request that needs no body. Treat empty as `{}`.
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

  // Registered inside its own scope so the plugin is loaded before the route
  // that needs it. At the top level `register` is deferred, so the route was
  // being added as a plain HTTP one — and the handler then received
  // (request, reply) instead of (socket, request).
  app.register(async instance => {
    await instance.register(websocket);

    /**
     * Live updates. One socket per signed-in client.
     *
     * The token is a query parameter because a browser's WebSocket constructor
     * cannot set headers — but it is resolved by the same `session.resolve` as
     * every REST route, so a revoked or expired token is refused here too.
     */
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
