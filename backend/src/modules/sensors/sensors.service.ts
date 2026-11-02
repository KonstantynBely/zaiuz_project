import { randomBytes, createHash } from 'node:crypto';
import { ApiError } from '../../common/errors.js';
import type { SensorsRepository, SensorRow } from './sensors.repository.js';
import type { SensorInput } from './sensors.schema.js';
import { parseId } from '../../common/validation.js';

export const keyHash = (key:string) => createHash('sha256').update(key).digest('hex');
function toSensor(row:SensorRow) {
  return {
    id: row.id, name: row.name, seriesId: row.series_id,
    createdAt: row.registered_at.toISOString(),
    ...(row.last_measurement_at ? { lastMeasurementAt: row.last_measurement_at.toISOString() } : {}),
  };
}
export function createSensorsService(repo: SensorsRepository) {
  return {
    async list() { return (await repo.list()).map(toSensor); },
    /**
     * Odczytuje opis aktywnego czujnika.
     * @throws ApiError 404 dla nieistniejącego lub wyrejestrowanego urządzenia.
     */
    async get(id:string) {
      const sensor = await repo.findById(id);
      if (!sensor) throw new ApiError(404,'Nie znaleziono czujnika');
      return toSensor(sensor);
    },
    /**
     * Waliduje BIGINT serii, generuje klucz 32-bajtowy i przekazuje do repozytorium wyłącznie jego hash.
     * @param simulationWorker Czy utworzyć także trwały wpis sprzątania sensora symulacji.
     * @returns Opis z jednorazowym apiKey; późniejsze odczyty nie zawierają klucza.
     * @throws ApiError 422 dla niepoprawnej lub nieistniejącej serii.
     */
    async register(body: SensorInput, simulationWorker = false) {
      if (typeof body.seriesId === 'number' && !Number.isSafeInteger(body.seriesId)) {
        throw new ApiError(422, 'Niepoprawny identyfikator serii');
      }
      const seriesId = parseId(String(body.seriesId), 422);
      const apiKey = randomBytes(32).toString('hex');
      const row = await repo.register({name:body.name,seriesId,keyHash:keyHash(apiKey),simulationWorker});
      if (!row) throw new ApiError(422,'Seria przypisana do czujnika nie istnieje');
      return { ...toSensor(row), apiKey };
    },
    /**
     * Unieważnia klucz aktywnego czujnika, zachowując historię.
     * @throws ApiError 404, gdy czujnik nie istnieje lub został już wyrejestrowany.
     */
    async revoke(id:string) {
      if (!await repo.revoke(id)) throw new ApiError(404,'Nie znaleziono czujnika');
    },
  };
}
export type SensorsService = ReturnType<typeof createSensorsService>;
