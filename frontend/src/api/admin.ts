import { fetchSeries, type Series } from './client';
import { request } from './http.ts';
export { ApiRequestError } from './http.ts';

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
  login: (username: string, password: string) =>
    request<AuthSession>('/api/auth/login', { method: 'POST', body: { username, password } }),
  logout: (token: string) =>
    request<void>('/api/auth/logout', { method: 'POST', token }),
  changePassword: (token: string, currentPassword: string, newPassword: string) =>
    request<void>('/api/auth/password', { method: 'PUT', token, body: { currentPassword, newPassword } }),
  listSeries: fetchSeries,
  createSeries: (token: string, input: SeriesInput) =>
    request<Series>('/api/series', { method: 'POST', token, body: input }),
  updateSeries: (token: string, id: string, input: SeriesInput) =>
    request<Series>('/api/series/' + encodeURIComponent(id), { method: 'PUT', token, body: input }),
  deleteSeries: (token: string, id: string) =>
    request<void>('/api/series/' + encodeURIComponent(id), { method: 'DELETE', token }),
  listSensors: (token: string) =>
    request<Sensor[]>('/api/sensors', { token }),
  createSensor: (token: string, name: string, seriesId: string) =>
    request<CreatedSensor>('/api/sensors', { method: 'POST', token, body: { name, seriesId } }),
  deleteSensor: (token: string, id: string) =>
    request<void>('/api/sensors/' + encodeURIComponent(id), { method: 'DELETE', token }),
  listSimulations: (token: string, signal?: AbortSignal) =>
    request<Simulation[]>('/api/simulations', { token, signal }),
  /** Zleca uruchomienie symulacji i zwraca początkowy stan odpowiedzi 202, nie wynik całego zadania. */
  startSimulation: (token: string, input: SimulationInput) =>
    request<Simulation>('/api/simulations', { token, method: 'POST', body: input }),
  stopSimulation: (token: string, id: string) =>
    request<Simulation>('/api/simulations/' + encodeURIComponent(id) + '/stop', { token, method: 'POST' }),
};
