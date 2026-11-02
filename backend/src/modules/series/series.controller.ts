import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseId } from '../../common/validation.js';
import type { SeriesService } from './series.service.js';
import type { SeriesInput } from './series.schema.js';

/** Żądanie HTTP z identyfikatorem serii w parametrach ścieżki. */
type IdRequest = FastifyRequest<{ Params: { seriesId: string } }>;
/** Żądanie HTTP z pełnym zestawem edytowalnych pól serii w body. */
type InputRequest = FastifyRequest<{ Body: SeriesInput }>;
/** Żądanie pełnej aktualizacji: ID w URL i dane serii w body. */
type UpdateRequest = FastifyRequest<{ Params: { seriesId: string }; Body: SeriesInput }>;

/** Buduje handlery CRUD serii i mapuje ich wyniki na kody oraz nagłówki HTTP. */
export function createSeriesController(service: SeriesService) {
  return {
    /** Udostępnia publiczną listę serii zwróconą przez serwis. */
    async list() { return service.list(); },
    /** Sprawdza ID przed odczytem pojedynczej serii. */
    async get(request: IdRequest) { return service.get(parseId(request.params.seriesId)); },
    /** Tworzy serię z body i odpowiada 201, wskazując nowy zasób w Location. */
    async create(request: InputRequest, reply: FastifyReply) {
      const created = await service.create(request.body);
      return reply.code(201).header('Location', `/api/series/${created.id}`).send(created);
    },
    /** Waliduje ID i przekazuje pełne dane zastępujące edytowalne pola serii. */
    async update(request: UpdateRequest) { return service.update(parseId(request.params.seriesId), request.body); },
    /** Usuwa serię wskazaną przez ID i zwraca 204 bez treści. */
    async remove(request: IdRequest, reply: FastifyReply) {
      await service.remove(parseId(request.params.seriesId));
      return reply.code(204).send();
    },
  };
}
