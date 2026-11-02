import type { FastifyReply,FastifyRequest } from 'fastify';
import { parseId } from '../../common/validation.js';
import type { MeasurementsService } from './measurements.service.js';
import type { MeasurementInput,MeasurementQuery } from './measurements.schema.js';

export function createMeasurementsController(service:MeasurementsService) {
  return {
    async list(req:FastifyRequest<{Querystring:MeasurementQuery}>) {return service.list(req.query);},
    async get(req:FastifyRequest<{Params:{measurementId:string}}>) {return service.get(parseId(req.params.measurementId));},
    async create(req:FastifyRequest<{Body:MeasurementInput}>,reply:FastifyReply) {
      const value=await service.create(req.headers['x-api-key'] as string|undefined,req.body);
      return reply.code(201).header('Location',`/api/measurements/${value.id}`).send(value);
    },
  };
}
