export interface Series {
  id: string | number;
  name: string;
  minValue: number;
  maxValue: number;
  color: string;
  unit?: string | null;
  icon?: string | null;
}

export interface Measurement {
  id: string | number;
  seriesId: string | number;
  value: number;
  timestamp: string;
  sensorId?: string | number;
}

async function readJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Żądanie ' + path + ' zakończone kodem ' + response.status);
  return response.json() as Promise<T>;
}

export function fetchHealth(signal?: AbortSignal) {
  return readJson<{ status: 'ok' }>('/api/health', signal);
}

export function fetchSeries(signal?: AbortSignal) {
  return readJson<Series[]>('/api/series', signal);
}

export function fetchMeasurements(signal?: AbortSignal) {
  return readJson<Measurement[]>('/api/measurements?sort=-timestamp&limit=1000', signal);
}
