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

export interface MeasurementFilters { from?: string; to?: string; series?: Array<string | number> }
export function fetchMeasurements(signal?: AbortSignal, filters: MeasurementFilters = {}) {
  const params = new URLSearchParams({ sort: '-timestamp', limit: '1000' });
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.series?.length) params.set('series', filters.series.map(String).join(','));
  return readJson<Measurement[]>('/api/measurements?' + params, signal);
}

/** The summary panel needs one latest reading per series, not a page of the global history. */
export type LatestSeriesResult =
  | { seriesId: string; measurement: Measurement | null; error?: never }
  | { seriesId: string; error: string; measurement?: never };

export async function fetchLatestForSeries(
  series: readonly Series[], signal?: AbortSignal,
): Promise<LatestSeriesResult[]> {
  const results: LatestSeriesResult[] = [];
  for (let index = 0; index < series.length; index += 6) {
    const batch = await Promise.all(series.slice(index, index + 6).map(async item => {
      const id = String(item.id);
      const query = new URLSearchParams({ sort: '-timestamp', limit: '1', series: id });
      try {
        const rows = await readJson<Measurement[]>('/api/measurements?' + query, signal);
        return { seriesId: id, measurement: rows[0] ?? null };
      } catch (reason) {
        if (signal?.aborted) throw reason;
        return { seriesId: id, error: reason instanceof Error ? reason.message : 'Nie udało się pobrać odczytu.' };
      }
    }));
    results.push(...batch);
  }
  return results;
}
