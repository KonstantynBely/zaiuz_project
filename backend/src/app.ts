import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { MetarStation, ObservedPoint } from './modules/simulations/metar.source.js';
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
import { createSimulationHttpClient } from './modules/simulations/simulations.http.js';
import { simulationsRoutes } from './modules/simulations/simulations.routes.js';
import { createEventsService } from './modules/events/events.service.js';
import { eventsRoutes } from './modules/events/events.routes.js';

declare module 'fastify' {
  interface FastifyRequest { simulationWorker: boolean }
}

/** Composition root: zależności można wstrzykiwać w testach bez tworzenia globalnego Pool. */
export function buildApp(options:{pool?:Pool;loadObserved?:(station:MetarStation)=>Promise<ObservedPoint[]>}={}):FastifyInstance {
  const app=Fastify({forceCloseConnections:'idle',logger:{redact:[
    'req.headers.authorization','req.headers.x-api-key','request.headers.authorization',
    'request.headers.x-api-key','req.headers.x-roversense-worker-key',
    'request.headers.x-roversense-worker-key','res.headers.set-cookie',
  ]}});
  registerErrorHandling(app);
  app.decorateRequest('simulationWorker', false);
  app.addHook('onRequest',async(request,reply)=>{
    const sse=request.url.split('?')[0]==='/api/events' && request.method==='GET' &&
      (request.headers.accept??'').split(',').some(x=>x.trim().startsWith('text/event-stream'));
    if(request.url.startsWith('/api/')&&!sse&&!acceptsJson(request.headers.accept)) {
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
  const events=createEventsService();
  app.register(async instance=>eventsRoutes(instance,events));
  app.addHook('preClose',async()=>{events.close();});
  if(options.pool) {
    const pool=options.pool;
    const authService=createAuthService(createAuthRepository(pool));
    const adminGuard:preHandlerHookHandler=async request=>{await authService.requireAdmin(bearerToken(request));};
    // Klucz jest jednorazowy dla procesu, zna go tylko lokalny klient REST symulatora.
    // Dostęp wyłącznie przez loopback i wyłącznie do POST/DELETE czujników.
    const workerKey=randomBytes(32).toString('hex');
    const workerKeyBytes=Buffer.from(workerKey);
    const sensorWriteGuard:preHandlerHookHandler=async request=>{
      const supplied=request.headers['x-roversense-worker-key'];
      const address=app.server.address();
      const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(request.ip);
      // Żądanie przez publiczny Caddy ma inną nazwę Host, choć proxy też działa na localhost.
      const direct=address && typeof address!=='string' &&
        request.headers.host===`127.0.0.1:${address.port}`;
      if (local && direct && typeof supplied==='string') {
        const candidate=Buffer.from(supplied);
        if (candidate.length===workerKeyBytes.length && timingSafeEqual(candidate,workerKeyBytes)) {
          request.simulationWorker = true;
          return;
        }
      }
      await authService.requireAdmin(bearerToken(request));
    };
    const seriesService=createSeriesService(createSeriesRepository(pool));
    const sensorService=createSensorsService(createSensorsRepository(pool));
    const measureService=createMeasurementsService(createMeasurementsRepository(pool),events.publish);
    app.register(async instance=>authRoutes(instance,authService,adminGuard));
    app.register(async instance=>seriesRoutes(instance,seriesService,adminGuard));
    app.register(async instance=>sensorsRoutes(instance,sensorService,adminGuard,sensorWriteGuard));
    app.register(async instance=>measurementsRoutes(instance,measureService));
    const simulations=createSimulationsService(app,createSimulationsRepository(pool),createSimulationHttpClient(app,workerKey),options.loadObserved);
    app.register(async instance=>simulationsRoutes(instance,simulations,adminGuard));
    app.addHook('preClose',async()=>{await simulations.close();});
  }
  return app;
}
