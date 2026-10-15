import type { FastifyReply, FastifyRequest } from 'fastify';
import { ApiError } from '../../common/errors.js';
import type { AuthService } from './auth.service.js';
import type { LoginBody, PasswordBody } from './auth.schema.js';

/** Pobieraj Bearer wyłącznie z nagłówka Authorization. */
export function bearerToken(request: FastifyRequest): string {
  const match = /^Bearer ([^ ]+)$/i.exec(request.headers.authorization ?? '');
  if (!match?.[1]) throw new ApiError(401, 'Wymagany token Bearer');
  return match[1];
}

export function createAuthController(service: AuthService) {
  return {
    async login(request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) {
      reply.header('Cache-Control', 'no-store');
      return service.login(request.body);
    },
    async logout(request: FastifyRequest, reply: FastifyReply) {
      await service.logout(bearerToken(request));
      return reply.code(204).send();
    },
    async password(request: FastifyRequest<{ Body: PasswordBody }>, reply: FastifyReply) {
      await service.changePassword(bearerToken(request), request.body);
      return reply.code(204).send();
    },
  };
}
