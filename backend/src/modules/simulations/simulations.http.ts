import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../common/errors.js';

interface SeriesDetails { minValue: number; maxValue: number; unit?: string | null }
interface RegisteredSensor { id: string; apiKey: string }

/**
 * Wszystkie operacje na czujniku symulacji idą po HTTP do zwykłych endpointów REST.
 * Token procesu nie jest hasłem administratora i nigdy nie trafia do przeglądarki ani bazy.
 */
export function createSimulationHttpClient(app: FastifyInstance, workerKey: string) {
  function origin(): string {
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new ApiError(503, 'REST API nie jest gotowe.');
    return `http://127.0.0.1:${address.port}`;
  }

  async function request(path: string, method: 'GET' | 'POST' | 'DELETE',
    body?: Record<string, unknown>, internal = false): Promise<Response> {
    try {
      return await fetch(origin() + path, {
        method,
        headers: {
          Accept: 'application/json',
          ...(internal ? { 'X-RoverSense-Worker-Key': workerKey } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      throw new ApiError(502, 'Nie udało się połączyć z lokalnym REST API.');
    }
  }

  async function problem(response: Response): Promise<never> {
    let detail = '';
    try {
      const payload: unknown = await response.json();
      if (payload && typeof payload === 'object' && 'detail' in payload &&
        typeof payload.detail === 'string') detail = payload.detail;
    } catch { /* Błędna odpowiedź lokalnego API nie może ujawniać danych dostępowych. */ }
    // Odrzucony klucz wewnętrzny to błąd konfiguracji, nie wygasła sesja użytkownika.
    const status = [404, 409, 422].includes(response.status) ? response.status : 502;
    throw new ApiError(status, status === 502 ? 'Lokalne REST API odrzuciło żądanie symulatora.' :
      detail || 'Nie udało się wykonać operacji na czujniku.');
  }

  return {
    async getSeries(id: string): Promise<SeriesDetails> {
      const response = await request('/api/series/' + encodeURIComponent(id), 'GET');
      if (!response.ok) return problem(response);
      const value: unknown = await response.json();
      if (!value || typeof value !== 'object' ||
        !('minValue' in value) || typeof value.minValue !== 'number' ||
        !('maxValue' in value) || typeof value.maxValue !== 'number') {
        throw new ApiError(502, 'Lokalne API zwróciło niepoprawny opis serii.');
      }
      return value as SeriesDetails;
    },
    async registerSensor(name: string, seriesId: string): Promise<RegisteredSensor> {
      const response = await request('/api/sensors', 'POST', { name, seriesId }, true);
      if (response.status !== 201) return problem(response);
      const value: unknown = await response.json();
      if (!value || typeof value !== 'object' ||
        !('id' in value) || !('apiKey' in value) ||
        typeof value.id !== 'string' || !/^[1-9]\d*$/.test(value.id) ||
        typeof value.apiKey !== 'string' || !/^[0-9a-f]{64}$/i.test(value.apiKey)) {
        throw new ApiError(502, 'Lokalne API zwróciło niepoprawny klucz czujnika.');
      }
      return { id: value.id, apiKey: value.apiKey };
    },
    async revokeSensor(id: string): Promise<void> {
      // Podczas kończenia zadania przejściowy błąd sieci nie powinien pozostawiać aktywnego klucza.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await request('/api/sensors/' + encodeURIComponent(id), 'DELETE',
            undefined, true);
          if (response.status === 204 || response.status === 404) return;
          await problem(response);
        } catch (error) {
          if (attempt === 2 || (error instanceof ApiError && error.status !== 502)) throw error;
          await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 100));
        }
      }
    },
  };
}
export type SimulationHttpClient = ReturnType<typeof createSimulationHttpClient>;
