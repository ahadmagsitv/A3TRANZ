import type { FastifyReply, FastifyRequest } from 'fastify';
import { type Capability, can } from '@a3/domain';
import { forbidden } from './errors.ts';
import { type Caller, bearer, resolve } from './session.ts';

declare module 'fastify' {
  interface FastifyRequest {
    caller: Caller;
  }
}

export const authenticate = async (req: FastifyRequest): Promise<void> => {
  req.caller = await resolve(bearer(req.headers.authorization));
};

export const officeOnly = async (req: FastifyRequest): Promise<void> => {
  await authenticate(req);
  if (req.caller.user.role === 'driver') {
    throw forbidden('The office console is not available to drivers.');
  }
};

export const driverOnly = async (req: FastifyRequest): Promise<void> => {
  await authenticate(req);
  if (req.caller.user.role !== 'driver') {
    throw forbidden('This is a driver-only action.');
  }
};

export const requires =
  (capability: Capability) =>
  async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    await authenticate(req);
    if (!can(req.caller.user.role, capability)) {
      throw forbidden('Your role does not allow that.');
    }
  };
