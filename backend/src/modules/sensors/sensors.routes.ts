import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { sensorBodySchema, type SensorInput } from './sensors.schema.js';
import { createSensorsController } from './sensors.controller.js';
import type { SensorsService } from './sensors.service.js';

export async function sensorsRoutes(app:FastifyInstance,service:SensorsService,auth:preHandlerHookHandler,sensorWriteAuth:preHandlerHookHandler):Promise<void> {
  const ctl=createSensorsController(service);
  app.get('/api/sensors',{preHandler:auth},ctl.list);
  app.get<{Params:{sensorId:string}}>('/api/sensors/:sensorId',{preHandler:auth},ctl.get);
  app.post<{Body:SensorInput}>('/api/sensors',{preHandler:sensorWriteAuth,schema:{body:sensorBodySchema}},ctl.register);
  app.delete<{Params:{sensorId:string}}>('/api/sensors/:sensorId',{preHandler:sensorWriteAuth},ctl.revoke);
}
