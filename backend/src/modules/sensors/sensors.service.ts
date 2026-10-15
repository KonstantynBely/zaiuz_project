import { randomBytes, createHash } from 'node:crypto';
import { ApiError } from '../../common/errors.js';
import type { SensorsRepository, SensorRow } from './sensors.repository.js';
import type { SensorInput } from './sensors.schema.js';

export const keyHash = (key:string) => createHash('sha256').update(key).digest('hex');
export function toSensor(row:SensorRow) {
  return {
    id: row.id, name: row.name, seriesId: row.series_id,
    createdAt: row.registered_at.toISOString(),
    ...(row.last_measurement_at ? { lastMeasurementAt: row.last_measurement_at.toISOString() } : {}),
  };
}
export function createSensorsService(repo: SensorsRepository) {
  return {
    async list() { return (await repo.list()).map(toSensor); },
    async get(id:string) {
      const sensor = await repo.findById(id);
      if (!sensor) throw new ApiError(404,'Nie znaleziono czujnika');
      return toSensor(sensor);
    },
    async register(body: SensorInput) {
      const apiKey = randomBytes(32).toString('hex');
      const row = await repo.register({name:body.name,seriesId:String(body.seriesId),keyHash:keyHash(apiKey)});
      if (!row) throw new ApiError(422,'Seria przypisana do czujnika nie istnieje');
      return { ...toSensor(row), apiKey };
    },
    async revoke(id:string) {
      if (!await repo.revoke(id)) throw new ApiError(404,'Nie znaleziono czujnika');
    },
  };
}
export type SensorsService = ReturnType<typeof createSensorsService>;
