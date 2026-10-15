import Fastify from 'fastify';
import type { Pool } from 'pg';
import { healthRoutes } from './modules/health/health.routes.js';
import { createSeriesRepository } from './modules/series/series.repository.js';
import { createSeriesService } from './modules/series/series.service.js';
import { seriesRoutes } from './modules/series/series.routes.js';

/** Konstruuje API; zależności można zastąpić w testach bez bazy produkcyjnej. */
export function buildApp(options: { pool?: Pick<Pool, 'query'> } = {}) {
  const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.x-api-key'] } });
  app.register(healthRoutes);
  if (options.pool) {
    const repository = createSeriesRepository(options.pool as Pool);
    const service = createSeriesService(repository);
    app.register(async (instance) => seriesRoutes(instance, service));
  }
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    return payload;
  });
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Nieobsłużony błąd API');
    reply.code(500).type('application/problem+json').send({
      type: 'about:blank', title: 'Błąd serwera', status: 500,
    });
  });
  return app;
}
