import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseId } from '../../common/validation.js';
import type { SeriesService } from './series.service.js';
import type { SeriesInput } from './series.schema.js';

type IdRequest = FastifyRequest<{ Params: { seriesId: string } }>;
type InputRequest = FastifyRequest<{ Body: SeriesInput }>;
type UpdateRequest = FastifyRequest<{ Params: { seriesId: string }; Body: SeriesInput }>;

export function createSeriesController(service: SeriesService) {
  return {
    async list() { return service.list(); },
    async get(request: IdRequest) { return service.get(parseId(request.params.seriesId)); },
    async create(request: InputRequest, reply: FastifyReply) {
      const created = await service.create(request.body);
      return reply.code(201).header('Location', `/api/series/${created.id}`).send(created);
    },
    async update(request: UpdateRequest) { return service.update(parseId(request.params.seriesId), request.body); },
    async remove(request: IdRequest, reply: FastifyReply) {
      await service.remove(parseId(request.params.seriesId));
      return reply.code(204).send();
    },
  };
}
