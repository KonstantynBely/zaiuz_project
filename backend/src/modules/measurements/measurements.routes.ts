import type { FastifyInstance } from 'fastify';
import type { MeasurementsService } from './measurements.service.js';
import type { MeasurementInput,MeasurementQuery } from './measurements.schema.js';
import { measurementBodySchema } from './measurements.schema.js';
import { createMeasurementsController } from './measurements.controller.js';
import { ApiError } from '../../common/errors.js';

/** Rejestruje publiczne odczyty i POST uwierzytelniany X-API-Key; nie udostępnia edycji pomiarów. */
export async function measurementsRoutes(app:FastifyInstance,service:MeasurementsService):Promise<void> {
  const ctl=createMeasurementsController(service);
  app.get<{Querystring:MeasurementQuery}>('/api/measurements',ctl.list);
  app.get<{Params:{measurementId:string}}>('/api/measurements/:measurementId',ctl.get);
  // Uwierzytelnienie urządzenia wykonujemy przed walidacją treści żądania.
  app.post<{Body:MeasurementInput}>('/api/measurements',{
    /**
     * Odrzuca brak lub zbyt krótki klucz przed walidacją JSON.
     * Pełną kontrolę aktywności i przypisania czujnika wykonuje później repozytorium.
     */
    onRequest: async req => {
      const key=req.headers['x-api-key'];
      if(typeof key!=='string'||key.length<32) {
        throw new ApiError(401,'Wymagany poprawny klucz X-API-Key');
      }
    },schema:{body:measurementBodySchema},
  },ctl.create);
}
