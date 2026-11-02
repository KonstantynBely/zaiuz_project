import type { FastifyInstance } from 'fastify';
import type { EventsService } from './events.service.js';

/**
 * Rejestruje publiczne GET /api/events z długotrwałą odpowiedzią SSE.
 * Przejmuje surową odpowiedź HTTP, wysyła heartbeat co 15 s i usuwa klienta po rozłączeniu.
 */
export async function eventsRoutes(app:FastifyInstance,events:EventsService):Promise<void> {
  app.get('/api/events', async(_request,reply)=>{
    reply.hijack();
    const response=reply.raw;
    response.writeHead(200,{
      'Content-Type':'text/event-stream; charset=utf-8',
      'Cache-Control':'no-cache, no-transform',
      'Connection':'keep-alive',
      'X-Accel-Buffering':'no',
      'X-Content-Type-Options':'nosniff',
    });
    response.write(': connected\n\n');
    events.register(response);
    const heartbeat=setInterval( ()=>{
      if(!response.destroyed && !response.writableEnded)response.write(': ping\n\n');
    },15000);
    heartbeat.unref();
    response.once('close', ()=>{clearInterval(heartbeat);events.unregister(response);});
  });
}
