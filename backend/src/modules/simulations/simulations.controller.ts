import type { FastifyReply,FastifyRequest } from 'fastify';
import type { SimulationInput } from './simulations.schema.js';
import type { SimulationsService } from './simulations.service.js';

export function createSimulationsController(service:SimulationsService) {
  return {
    async list(){return service.list();},
    async get(req:FastifyRequest<{Params:{simulationId:string}}>) {
      return service.get(req.params.simulationId);
    },
    async start(req:FastifyRequest<{Body:SimulationInput}>,reply:FastifyReply) {
      const run=await service.start(req.body);
      return reply.code(202).header('Location',`/api/simulations/${run.id}`).send(run);
    },
    async stop(req:FastifyRequest<{Params:{simulationId:string}}>) {
      return service.stop(req.params.simulationId);
    },
  };
}
