import { request } from './http.ts';

/** Publiczny opis serii, jej zakresu i sposobu prezentacji; ID może być liczbą lub tekstem. */
export interface Series {
  id: string | number;
  name: string;
  minValue: number;
  maxValue: number;
  color: string;
  unit?: string | null;
  icon?: string | null;
}

/** Publiczny odczyt czujnika: nieprzezroczyste ID, seria, wartość i znacznik czasu ze strefą. */
export interface Measurement {
  id: string | number;
  seriesId: string | number;
  value: number;
  timestamp: string;
  sensorId?: string | number;
}

/** Odczytuje publiczny stan procesu API; opcjonalny sygnał anuluje żądanie. */
export function fetchHealth(signal?: AbortSignal) {
  return request<{ status: 'ok' }>('/api/health', { signal });
}

/** Pobiera publiczną listę serii bez tokenu administratora. */
export function fetchSeries(signal?: AbortSignal) {
  return request<Series[]>('/api/series', { signal });
}

/** Opcjonalne serie i granice czasu przesyłane przez klienta do odczytu REST. */
export interface MeasurementFilters { from?: string; to?: string; series?: Array<string | number> }
/**
 * Pobiera do 1000 najnowszych pomiarów wybranych serii i domkniętego zakresu dat.
 * Filtry koduje przez URLSearchParams; brak serii oznacza odczyt wszystkich.
 */
export function fetchMeasurements(signal?: AbortSignal, filters: MeasurementFilters = {}) {
  const params = new URLSearchParams({ sort: '-timestamp', limit: '1000' });
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.series?.length) params.set('series', filters.series.map(String).join(','));
  return request<Measurement[]>('/api/measurements?' + params, { signal });
}

/** Niezależny wynik odczytu ostatniej próbki: pomiar, null dla braku danych albo błąd danej serii. */
export type LatestSeriesResult =
  | { seriesId: string; measurement: Measurement | null; error?: never }
  | { seriesId: string; error: string; measurement?: never };

/**
 * Odczytuje ostatni pomiar każdej serii osobno, partiami do sześciu równoległych żądań.
 * Awaria pojedynczej serii nie usuwa wyników pozostałych; anulowanie przerywa kolejne partie.
 * @returns Dla każdej serii pomiar, null przy braku odczytów albo komunikat błędu.
 */
export async function fetchLatestForSeries(
  series: readonly Series[], signal?: AbortSignal,
): Promise<LatestSeriesResult[]> {
  const results: LatestSeriesResult[] = [];
  for (let index = 0; index < series.length; index += 6) {
    const batch = await Promise.all(series.slice(index, index + 6).map(/** Pobiera najnowszą próbkę jednej serii i izoluje jej błąd od pozostałych wyników partii. */ async item => {
      const id = String(item.id);
      const query = new URLSearchParams({ sort: '-timestamp', limit: '1', series: id });
      try {
        const rows = await request<Measurement[]>('/api/measurements?' + query, { signal });
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
