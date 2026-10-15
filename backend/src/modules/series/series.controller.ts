import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SeriesService } from './series.service.js';

export function createSeriesController(service: SeriesService) {
  return {
    async list() { return service.list(); },
    async get(request: FastifyRequest<{ Params: { seriesId: string } }>, reply: FastifyReply) {
      const id = request.params.seriesId;
      if (!/^[1-9]\d*$/.test(id)) {
        return reply.code(404).type('application/problem+json').send({
          type: 'about:blank', title: 'Nie znaleziono serii', status: 404,
        });
      }
      const series = await service.get(id);
      if (!series) {
        return reply.code(404).type('application/problem+json').send({
          type: 'about:blank', title: 'Nie znaleziono serii', status: 404,
        });
      }
      return series;
    },
  };
}
