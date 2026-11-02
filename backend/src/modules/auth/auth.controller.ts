import type { FastifyReply, FastifyRequest } from 'fastify';
import { ApiError } from '../../common/errors.js';
import type { AuthService } from './auth.service.js';
import type { LoginBody, PasswordBody } from './auth.schema.js';

/**
 * Odczytuje pojedynczy token ze schematu Bearer nagłówka Authorization.
 * Nie przyjmuje tokenów z URL ani body.
 * @throws ApiError 401 przy braku lub niepoprawnym nagłówku.
 */
export function bearerToken(request: FastifyRequest): string {
  const match = /^Bearer ([^ ]+)$/i.exec(request.headers.authorization ?? '');
  if (!match?.[1]) throw new ApiError(401, 'Wymagany token Bearer');
  return match[1];
}

/** Buduje handlery HTTP uwierzytelniania; reguły sesji deleguje do serwisu. */
export function createAuthController(service: AuthService) {
  return {
    /** Przekazuje dane logowania do serwisu i wyłącza cache odpowiedzi zawierającej token. */
    async login(request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) {
      reply.header('Cache-Control', 'no-store');
      return service.login(request.body);
    },
    /** Unieważnia sesję wskazaną przez Bearer i kończy odpowiedź kodem 204. */
    async logout(request: FastifyRequest, reply: FastifyReply) {
      await service.logout(bearerToken(request));
      return reply.code(204).send();
    },
    /** Zmienia hasło dla sesji Bearer; po sukcesie zwraca 204 bez treści. */
    async password(request: FastifyRequest<{ Body: PasswordBody }>, reply: FastifyReply) {
      await service.changePassword(bearerToken(request), request.body);
      return reply.code(204).send();
    },
  };
}
