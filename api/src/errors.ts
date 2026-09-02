import type { FastifyReply } from 'fastify';
import { AuthError, JobStateError } from '@a3/domain';

/** Anything the client is meant to render, rather than a 500. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field: string | undefined;

  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

export const unauthorized = (m = 'Sign in to continue.') =>
  new HttpError(401, 'unauthorized', m);
export const forbidden = (m = 'You do not have access to that.') =>
  new HttpError(403, 'forbidden', m);
export const notFound = (m = 'Not found.') => new HttpError(404, 'not_found', m);
export const conflict = (m: string) => new HttpError(409, 'conflict', m);

/**
 * One mapping, applied to every route. A JobStateError is a 422 carrying the
 * exact copy the client already renders under a locked button — the gate's own
 * words, not a second wording invented here.
 */
export const send = (reply: FastifyReply, err: unknown): FastifyReply => {
  if (err instanceof HttpError) {
    return reply
      .code(err.status)
      .send({ code: err.code, message: err.message, field: err.field });
  }
  if (err instanceof AuthError) {
    const status = err.code === 'invalid_credentials' || err.code === 'unknown_email'
      ? 401
      : err.code === 'inactive_account'
        ? 403
        : 400;
    return reply
      .code(status)
      .send({ code: err.code, message: err.message, field: err.field });
  }
  if (err instanceof JobStateError) {
    return reply.code(422).send({ code: 'gate_not_met', message: err.message });
  }
  // Fastify raises its own errors before a handler ever runs — malformed JSON,
  // payload too large, unsupported media type. Those carry a correct 4xx and
  // must keep it: reporting a client's bad request as a 500 both lies to the
  // caller and buries a real server fault in noise.
  const fastify = err as { statusCode?: number; code?: string; message?: string };
  if (
    typeof fastify.statusCode === 'number' &&
    fastify.statusCode >= 400 &&
    fastify.statusCode < 500
  ) {
    return reply.code(fastify.statusCode).send({
      code: fastify.code ?? 'bad_request',
      message: fastify.message ?? 'That request could not be handled.',
    });
  }

  reply.log.error({ err }, 'unhandled');
  return reply
    .code(500)
    .send({ code: 'internal', message: 'Something went wrong on our side.' });
};
