import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../common/errors.js';

/** Minimalny opis serii potrzebny workerowi do sprawdzenia zakresu i zgodności jednostki METAR. */
interface SeriesDetails { minValue: number; maxValue: number; unit?: string | null }
/** Jednorazowy wynik rejestracji lokalnego sensora, przechowywany w pamięci workera. */
interface RegisteredSensor { id: string; apiKey: string }

/**
 * Buduje klienta lokalnych endpointów REST używanych przez worker symulacji.
 * Klucz procesu wysyła tylko przy tworzeniu i usuwaniu czujników, bez przechowywania tokenu administratora.
 */
export function createSimulationHttpClient(app: FastifyInstance, workerKey: string) {
  /**
   * Wyznacza adres loopback z rzeczywiście nasłuchującego portu Fastify.
   * @throws ApiError 503, gdy instancja nie udostępnia serwera TCP.
   */
  function origin(): string {
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new ApiError(503, 'REST API nie jest gotowe.');
    return `http://127.0.0.1:${address.port}`;
  }

  /**
   * Wysyła lokalne żądanie z timeoutem 4 s, nagłówkami JSON i opcjonalnym kluczem workera.
   * @returns Surowa odpowiedź HTTP; wywołujący musi odczytać body.
   * @throws ApiError 502 przy problemie połączenia.
   */
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

  /**
   * Odczytuje bezpieczny opis odmowy lokalnego API i rzuca błąd domenowy.
   * Zachowuje 404/409/422; inne statusy mapuje na 502, aby odmowa klucza workera nie wylogowała operatora.
   */
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
    /** Pobiera przez publiczne REST granice i jednostkę serii oraz sprawdza kształt odpowiedzi. */
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
    /**
     * Rejestruje dedykowany czujnik przez REST i sprawdza tekstowe ID oraz 64-znakowy klucz.
     * @returns Sekret tylko do pamięci wykonawcy; nie wolno umieszczać go w opisie symulacji.
     */
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
    /**
     * Wyrejestrowuje czujnik przez REST; 204 i 404 traktuje jako osiągnięty stan końcowy.
     * Błędy komunikacji ponawia do trzech prób z krótkim opóźnieniem; trwałą kolejkę obsługuje serwis.
     */
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
          await new Promise(/** Kończy krótkie opóźnienie pomiędzy kolejnymi próbami lokalnego REST. */ resolve => setTimeout(resolve, (attempt + 1) * 100));
        }
      }
    },
  };
}
export type SimulationHttpClient = ReturnType<typeof createSimulationHttpClient>;
