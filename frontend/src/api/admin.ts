import { fetchSeries, type Series } from './client';
import { request } from './http.ts';
export { ApiRequestError } from './http.ts';

/** Edytowalne pola pełnego opisu serii; granice muszą być skończone i spełniać minValue < maxValue. */
export interface SeriesInput {
  name: string;
  minValue: number;
  maxValue: number;
  color: string;
  unit: string | null;
  icon: string | null;
}
/** Opis zarejestrowanego urządzenia bez klucza API; czas ostatniego pomiaru jest opcjonalny. */
export interface Sensor {
  id: string;
  name: string;
  seriesId: string;
  createdAt: string;
  lastMeasurementAt?: string;
}
/** Jednorazowa odpowiedź rejestracji: opis czujnika wraz z jawnym apiKey. */
export interface CreatedSensor extends Sensor { apiKey: string }
/** Odpowiedź logowania: sekret Bearer i czas życia sesji w sekundach. */
export interface AuthSession { accessToken: string; tokenType: 'Bearer'; expiresIn: number }

/** Stan cyklu życia zadania, obejmujący przygotowanie, wykonywanie, zatrzymywanie i trzy stany końcowe. */
export type SimulationState = 'pending' | 'running' | 'stopping' | 'stopped' | 'completed' | 'failed';
/** Parametry nowego zadania; dla observed wymagane jest station, a count i zakres wynikają z obserwacji oraz serii. */
export interface SimulationInput {
  seriesId: string;
  name?: string;
  mode: 'history' | 'live';
  pattern: 'random' | 'sine' | 'observed';
  station?: 'EPWA' | 'EPKK' | 'EPGD';
  count?: number;
  intervalMs: number;
  min?: number;
  max?: number;
}
/** Publiczny status uruchomienia z parametrami, licznikami i błędem, bez klucza czujnika. */
export interface Simulation {
  id: string;
  seriesId: string;
  sensorId: string | null;
  state: SimulationState;
  parameters: Required<Pick<SimulationInput, 'mode' | 'pattern' | 'intervalMs' | 'count' | 'min' | 'max'>> &
    Pick<SimulationInput, 'station'> & { source?: 'AWC METAR' };
  acceptedCount: number;
  rejectedCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

export const adminApi = {
  /** Wysyła login i hasło do API, zwracając token sesji i czas jej ważności w sekundach. */
  login: (username: string, password: string) =>
    request<AuthSession>('/api/auth/login', { method: 'POST', body: { username, password } }),
  /** Wysyła żądanie cofnięcia sesji Bearer; poprawna odpowiedź 204 nie zawiera danych. */
  logout: (token: string) =>
    request<void>('/api/auth/logout', { method: 'POST', token }),
  /** Wysyła obecne i nowe hasło w sesji Bearer; sukces unieważnia dotychczasowe sesje na serwerze. */
  changePassword: (token: string, currentPassword: string, newPassword: string) =>
    request<void>('/api/auth/password', { method: 'PUT', token, body: { currentPassword, newPassword } }),
  listSeries: fetchSeries,
  /** Tworzy serię z kompletem pól wejściowych, używając sesji administratora. */
  createSeries: (token: string, input: SeriesInput) =>
    request<Series>('/api/series', { method: 'POST', token, body: input }),
  /** Zastępuje edytowalne pola serii wskazanej zakodowanym ID; konflikt zakresu jest błędem API. */
  updateSeries: (token: string, id: string, input: SeriesInput) =>
    request<Series>('/api/series/' + encodeURIComponent(id), { method: 'PUT', token, body: input }),
  /** Usuwa serię i jej zależności; potwierdzenie użytkownika należy do wywołującego widoku. */
  deleteSeries: (token: string, id: string) =>
    request<void>('/api/series/' + encodeURIComponent(id), { method: 'DELETE', token }),
  /** Odczytuje aktywne czujniki dla administratora; lista nie zawiera kluczy API. */
  listSensors: (token: string) =>
    request<Sensor[]>('/api/sensors', { token }),
  /** Rejestruje czujnik serii i odbiera jednorazowy jawny klucz; wywołujący odpowiada za jego bezpieczną prezentację. */
  createSensor: (token: string, name: string, seriesId: string) =>
    request<CreatedSensor>('/api/sensors', { method: 'POST', token, body: { name, seriesId } }),
  /** Wyrejestrowuje czujnik wskazany ID, zachowując jego zapisane pomiary. */
  deleteSensor: (token: string, id: string) =>
    request<void>('/api/sensors/' + encodeURIComponent(id), { method: 'DELETE', token }),
  /** Pobiera aktywne zadania i ograniczoną historię z opcjonalnym anulowaniem przez poller. */
  listSimulations: (token: string, signal?: AbortSignal) =>
    request<Simulation[]>('/api/simulations', { token, signal }),
  /** Zleca uruchomienie symulacji i zwraca początkowy stan odpowiedzi 202, nie wynik całego zadania. */
  startSimulation: (token: string, input: SimulationInput) =>
    request<Simulation>('/api/simulations', { token, method: 'POST', body: input }),
  /** Zleca zatrzymanie zadania i odczytuje stan po zakończeniu sprzątania po stronie serwera. */
  stopSimulation: (token: string, id: string) =>
    request<Simulation>('/api/simulations/' + encodeURIComponent(id) + '/stop', { token, method: 'POST' }),
};
