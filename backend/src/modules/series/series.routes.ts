import type { FastifyInstance } from 'fastify';
import type { SeriesService } from './series.service.js';
import { createSeriesController } from './series.controller.js';

export async function seriesRoutes(app: FastifyInstance, service: SeriesService): Promise<void> {
  const controller = createSeriesController(service);
  app.get('/api/series', controller.list);
  app.get<{ Params: { seriesId: string } }>('/api/series/:seriesId', controller.get);
}
