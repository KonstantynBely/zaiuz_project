import type { Series } from './client';

export interface SeriesInput {
  name: string;
  minValue: number;
  maxValue: number;
  color: string;
  unit: string | null;
  icon: string | null;
}
export interface Sensor {
  id: string;
  name: string;
  seriesId: string;
  createdAt: string;
  lastMeasurementAt?: string;
}
export interface CreatedSensor extends Sensor { apiKey: string }
export interface AuthSession { accessToken: string; tokenType: 'Bearer'; expiresIn: number }

export type SimulationState = 'pending' | 'running' | 'stopping' | 'stopped' | 'completed' | 'failed';
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
  source?: 'AWC METAR';
}
export interface Simulation {
  id: string;
  seriesId: string;
  sensorId: string | null;
  state: SimulationState;
  parameters: Required<Pick<SimulationInput, 'mode' | 'pattern' | 'intervalMs' | 'count' | 'min' | 'max'>> &
    Pick<SimulationInput, 'station' | 'source'>;
  acceptedCount: number;
  rejectedCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

export class ApiRequestError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

async function request<T>(path: string, options: {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  token?: string;
  body?: object;
} = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: 'Bearer ' + options.token } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  if (!response.ok) {
    let detail = '';
    try {
      const problem = await response.json() as { detail?: string; title?: string };
      detail = problem.detail || problem.title || '';
    } catch { /* Nie każda odpowiedź błędu zawiera JSON. */ }
    const explanation = detail || ('Serwer zwrócił HTTP ' + response.status);
    throw new ApiRequestError(response.status, explanation);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const adminApi = {
  login: (username: string, password: string) =>
    request<AuthSession>('/api/auth/login', { method: 'POST', body: { username, password } }),
  logout: (token: string) =>
    request<void>('/api/auth/logout', { method: 'POST', token }),
  changePassword: (token: string, currentPassword: string, newPassword: string) =>
    request<void>('/api/auth/password', { method: 'PUT', token, body: { currentPassword, newPassword } }),
  listSeries: () => request<Series[]>('/api/series'),
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
  listSimulations: (token: string) =>
    request<Simulation[]>('/api/simulations', { token }),
  startSimulation: (token: string, input: SimulationInput) =>
    request<Simulation>('/api/simulations', { token, method: 'POST', body: input }),
  stopSimulation: (token: string, id: string) =>
    request<Simulation>('/api/simulations/' + encodeURIComponent(id) + '/stop', { token, method: 'POST' }),
};
