import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { AuthService } from './auth.service.js';
import type { LoginBody, PasswordBody } from './auth.schema.js';
import { loginSchema, passwordSchema } from './auth.schema.js';
import { createAuthController } from './auth.controller.js';

export async function authRoutes(app: FastifyInstance, service: AuthService, auth: preHandlerHookHandler): Promise<void> {
  const ctl = createAuthController(service);
  app.post<{ Body: LoginBody }>('/api/auth/login', { schema: { body: loginSchema } }, ctl.login);
  app.post('/api/auth/logout', { preHandler: auth }, ctl.logout);
  app.put<{ Body: PasswordBody }>('/api/auth/password',
    { preHandler: auth, schema: { body: passwordSchema } }, ctl.password);
}
