import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseId } from '../../common/validation.js';
import type { SensorsService } from './sensors.service.js';
import type { SensorInput } from './sensors.schema.js';

export function createSensorsController(service:SensorsService) {
  return {
    async list() { return service.list(); },
    async get(req:FastifyRequest<{Params:{sensorId:string}}>) { return service.get(parseId(req.params.sensorId)); },
    async register(req:FastifyRequest<{Body:SensorInput}>, reply:FastifyReply) {
      const sensor=await service.register(req.body, req.simulationWorker);
      reply.header('Cache-Control','no-store');
      return reply.code(201).header('Location',`/api/sensors/${sensor.id}`).send(sensor);
    },
    async revoke(req:FastifyRequest<{Params:{sensorId:string}}>,reply:FastifyReply) {
      await service.revoke(parseId(req.params.sensorId));return reply.code(204).send();
    },
  };
}
