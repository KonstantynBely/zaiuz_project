export interface Series {
  id: string | number;
  name: string;
  minValue: number;
  maxValue: number;
  color: string;
}

async function readJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Żądanie ${path} zakończone kodem ${response.status}`);
  return response.json() as Promise<T>;
}

export function fetchHealth(signal?: AbortSignal) {
  return readJson<{ status: 'ok' }>('/api/health', signal);
}

export function fetchSeries(signal?: AbortSignal) {
  return readJson<Series[]>('/api/series', signal);
}
