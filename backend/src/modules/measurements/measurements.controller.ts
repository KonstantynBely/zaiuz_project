import type { FastifyReply,FastifyRequest } from 'fastify';
import { parseId } from '../../common/validation.js';
import type { MeasurementsService } from './measurements.service.js';
import type { MeasurementInput,MeasurementQuery } from './measurements.schema.js';

/** Buduje handlery odczytu i zapisu pomiarów, oddzielając HTTP od reguł domenowych. */
export function createMeasurementsController(service:MeasurementsService) {
  return {
    /** Przekazuje tekstowe parametry zapytania do walidacji i filtrowania w serwisie. */
    async list(req:FastifyRequest<{Querystring:MeasurementQuery}>) {return service.list(req.query);},
    /** Waliduje BIGINT z URL i odczytuje pojedynczy pomiar; niepoprawne ID daje 404 przed SQL. */
    async get(req:FastifyRequest<{Params:{measurementId:string}}>) {return service.get(parseId(req.params.measurementId));},
    /** Pobiera klucz czujnika z X-API-Key, zapisuje pomiar i zwraca 201 z adresem Location. */
    async create(req:FastifyRequest<{Body:MeasurementInput}>,reply:FastifyReply) {
      const value=await service.create(req.headers['x-api-key'] as string|undefined,req.body);
      return reply.code(201).header('Location',`/api/measurements/${value.id}`).send(value);
    },
  };
}
