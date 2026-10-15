import Fastify from 'fastify';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Pool } from 'pg';
import { registerErrorHandling, acceptsJson, ApiError } from './common/errors.js';
import { bearerToken } from './modules/auth/auth.controller.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { createAuthRepository } from './modules/auth/auth.repository.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { createSeriesRepository } from './modules/series/series.repository.js';
import { createSeriesService } from './modules/series/series.service.js';
import { seriesRoutes } from './modules/series/series.routes.js';
import { createSensorsRepository } from './modules/sensors/sensors.repository.js';
import { createSensorsService } from './modules/sensors/sensors.service.js';
import { sensorsRoutes } from './modules/sensors/sensors.routes.js';
import { createMeasurementsRepository } from './modules/measurements/measurements.repository.js';
import { createMeasurementsService } from './modules/measurements/measurements.service.js';
import { measurementsRoutes } from './modules/measurements/measurements.routes.js';
import { createSimulationsRepository } from './modules/simulations/simulations.repository.js';
import { createSimulationsService } from './modules/simulations/simulations.service.js';
import { simulationsRoutes } from './modules/simulations/simulations.routes.js';

/** Composition root: zależności można wstrzykiwać w testach bez tworzenia globalnego Pool. */
export function buildApp(options:{pool?:Pool}={}):FastifyInstance {
  const app=Fastify({logger:{redact:[
    'req.headers.authorization','req.headers.x-api-key','request.headers.authorization',
    'request.headers.x-api-key','res.headers.set-cookie',
  ]}});
  registerErrorHandling(app);
  app.addHook('onRequest',async(request,reply)=>{
    if(request.url.startsWith('/api/')&&!acceptsJson(request.headers.accept)) {
      throw new ApiError(406,'Żądany format odpowiedzi nie jest dostępny');
    }
    if(request.url.startsWith('/api/')&& !['GET','HEAD','OPTIONS'].includes(request.method) && request.headers['content-type'] &&
      !/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'])) {
      throw new ApiError(415,'Żądanie musi mieć Content-Type: application/json');
    }
    reply.header('X-Content-Type-Options','nosniff');
  });
  app.addHook('onSend',async(_request,reply,payload)=>{
    reply.header('X-Content-Type-Options','nosniff');
    return payload;
  });
  app.register(healthRoutes);
  if(options.pool) {
    const pool=options.pool;
    const authService=createAuthService(createAuthRepository(pool));
    const adminGuard:preHandlerHookHandler=async request=>{await authService.requireAdmin(bearerToken(request));};
    const seriesService=createSeriesService(createSeriesRepository(pool));
    const sensorService=createSensorsService(createSensorsRepository(pool));
    const measureService=createMeasurementsService(createMeasurementsRepository(pool));
    app.register(async instance=>authRoutes(instance,authService,adminGuard));
    app.register(async instance=>seriesRoutes(instance,seriesService,adminGuard));
    app.register(async instance=>sensorsRoutes(instance,sensorService,adminGuard));
    app.register(async instance=>measurementsRoutes(instance,measureService));
    const simulations=createSimulationsService(app,createSimulationsRepository(pool),seriesService,sensorService);
    app.register(async instance=>simulationsRoutes(instance,simulations,adminGuard));
    app.addHook('onClose',async()=>{await simulations.close();});
  }
  return app;
}
