import type { FastifyInstance,preHandlerHookHandler } from 'fastify';
import { startSimulationSchema,type SimulationInput } from './simulations.schema.js';
import { createSimulationsController } from './simulations.controller.js';
import type { SimulationsService } from './simulations.service.js';

/** Rejestruje rozszerzenie API Start/Stop i odczyt statusów; każda trasa wymaga sesji administratora. */
export async function simulationsRoutes(app:FastifyInstance,service:SimulationsService,auth:preHandlerHookHandler):Promise<void> {
  const ctl=createSimulationsController(service);
  app.get('/api/simulations',{preHandler:auth},ctl.list);
  app.get<{Params:{simulationId:string}}>('/api/simulations/:simulationId',{preHandler:auth},ctl.get);
  app.post<{Body:SimulationInput}>('/api/simulations',{
    preHandler:auth,schema:{body:startSimulationSchema},
  },ctl.start);
  app.post<{Params:{simulationId:string}}>('/api/simulations/:simulationId/stop',{
    preHandler:auth,
  },ctl.stop);
}
