import type { FastifyReply,FastifyRequest } from 'fastify';
import type { SimulationInput } from './simulations.schema.js';
import type { SimulationsService } from './simulations.service.js';

/** Buduje handlery administracyjnego sterowania symulacjami; nie udostępnia kluczy czujników. */
export function createSimulationsController(service:SimulationsService) {
  return {
    /** Zwraca wszystkie aktywne zadania i ograniczoną historię wykonawcy. */
    async list(){return service.list();},
    /** Przekazuje ID do serwisu, który waliduje identyfikator i istnienie uruchomienia. */
    async get(req:FastifyRequest<{Params:{simulationId:string}}>) {
      return service.get(req.params.simulationId);
    },
    /** Uruchamia przygotowanie zadania i zwraca jego początkowy opis jako 202 z Location. */
    async start(req:FastifyRequest<{Body:SimulationInput}>,reply:FastifyReply) {
      const run=await service.start(req.body);
      return reply.code(202).header('Location',`/api/simulations/${run.id}`).send(run);
    },
    /** Zleca przerwanie zadania i czeka na jego sprzątnięcie przed zwróceniem stanu. */
    async stop(req:FastifyRequest<{Params:{simulationId:string}}>) {
      return service.stop(req.params.simulationId);
    },
  };
}
