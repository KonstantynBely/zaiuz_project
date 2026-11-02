import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { SeriesService } from './series.service.js';
import type { SeriesInput } from './series.schema.js';
import { seriesBodySchema } from './series.schema.js';
import { createSeriesController } from './series.controller.js';

/** Rejestruje publiczne odczyty serii; mutacje dodaje tylko po przekazaniu strażnika administratora. */
export async function seriesRoutes(app: FastifyInstance, service: SeriesService, auth?: preHandlerHookHandler): Promise<void> {
  const ctl = createSeriesController(service);
  app.get('/api/series', ctl.list);
  app.get<{ Params: { seriesId: string } }>('/api/series/:seriesId', ctl.get);
  if (auth) {
    app.post<{ Body: SeriesInput }>('/api/series', { preHandler: auth, schema: { body: seriesBodySchema } }, ctl.create);
    app.put<{ Params: { seriesId: string }; Body: SeriesInput }>('/api/series/:seriesId',
      { preHandler: auth, schema: { body: seriesBodySchema } }, ctl.update);
    app.delete<{ Params: { seriesId: string } }>('/api/series/:seriesId', { preHandler: auth }, ctl.remove);
  }
}
