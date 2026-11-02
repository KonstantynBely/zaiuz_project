import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseId } from '../../common/validation.js';
import type { SensorsService } from './sensors.service.js';
import type { SensorInput } from './sensors.schema.js';

/** Buduje administracyjne handlery rejestracji, odczytu i wyrejestrowania czujników. */
export function createSensorsController(service:SensorsService) {
  return {
    /** Zwraca listę aktywnych czujników bez jawnych kluczy i ich hashy. */
    async list() { return service.list(); },
    /** Waliduje ID z URL i odczytuje publiczny opis czujnika. */
    async get(req:FastifyRequest<{Params:{sensorId:string}}>) { return service.get(parseId(req.params.sensorId)); },
    /**
     * Rejestruje czujnik, przekazuje znacznik workera i zwraca jednorazowy klucz w odpowiedzi 201.
     * Ustawia no-store i Location, aby odpowiedź zawierająca sekret nie była buforowana.
     */
    async register(req:FastifyRequest<{Body:SensorInput}>, reply:FastifyReply) {
      const sensor=await service.register(req.body, req.simulationWorker);
      reply.header('Cache-Control','no-store');
      return reply.code(201).header('Location',`/api/sensors/${sensor.id}`).send(sensor);
    },
    /** Wyrejestrowuje czujnik wskazany poprawnym BIGINT i odpowiada 204; pomiary pozostają. */
    async revoke(req:FastifyRequest<{Params:{sensorId:string}}>,reply:FastifyReply) {
      await service.revoke(parseId(req.params.sensorId));return reply.code(204).send();
    },
  };
}
