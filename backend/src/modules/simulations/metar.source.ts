import { ApiError } from '../../common/errors.js';

/** Rzeczywiste obserwacje temperatury METAR ze stacji lotniczych (°C). */
export const METAR_STATIONS = ['EPWA', 'EPKK', 'EPGD'] as const;
export type MetarStation = typeof METAR_STATIONS[number];
export interface ObservedPoint { value: number; timestamp: string }

interface MetarRow { icaoId?: unknown; obsTime?: unknown; temp?: unknown }
const STATIONS = new Set<string>(METAR_STATIONS);
const SOURCE_URL = 'https://aviationweather.gov/api/data/metar?ids=EPWA%2CEPKK%2CEPGD&format=json&hours=24';
const CACHE_TIME_MS = 60_000;
let cache: { expires: number; rows: MetarRow[] } | null = null;
let pending: Promise<MetarRow[]> | null = null;

/** Walidacja i sortowanie pomiarów; nie interpolujemy ani nie wymyślamy brakujących wartości. */
export function parseMetarTemperatures(rows: unknown, station: MetarStation): ObservedPoint[] {
  if (!Array.isArray(rows)) throw new ApiError(503, 'Źródło obserwacji zwróciło nieprawidłowe dane.');
  const unique = new Map<number, ObservedPoint>();
  for (const item of rows as MetarRow[]) {
    if (!item || item.icaoId !== station || typeof item.temp !== 'number' || !Number.isFinite(item.temp)) continue;
    const time = typeof item.obsTime === 'number'
      ? item.obsTime * 1000 : typeof item.obsTime === 'string' ? Date.parse(item.obsTime) : NaN;
    if (!Number.isFinite(time) || time < Date.UTC(2000, 0, 1) || time > Date.now() + 5 * 60_000) continue;
    unique.set(time, { value: item.temp, timestamp: new Date(time).toISOString() });
  }
  return [...unique.entries()].sort((a, b) => a[0] - b[0]).map(([, value]) => value);
}

async function fetchSource(): Promise<MetarRow[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(SOURCE_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'RoverSense/0.2 (academic telemetry project)' },
    });
    if (!response.ok) throw new ApiError(503, 'Serwis obserwacji meteorologicznych nie odpowiada.');
    const body = await response.text();
    if (body.length > 512_000) throw new ApiError(503, 'Serwis zwrócił zbyt dużą odpowiedź.');
    const rows: unknown = JSON.parse(body);
    if (!Array.isArray(rows)) throw new ApiError(503, 'Serwis zwrócił nieprawidłową odpowiedź.');
    return rows as MetarRow[];
  } catch {
    throw new ApiError(503, 'Nie udało się pobrać obserwacji METAR. Spróbuj ponownie później.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadMetarTemperatures(station: MetarStation): Promise<ObservedPoint[]> {
  if (!STATIONS.has(station)) throw new ApiError(422, 'Nieznana stacja meteorologiczna.');
  if (!cache || cache.expires < Date.now()) {
    if (!pending) {
      pending = fetchSource().then(rows => {
        cache = { rows, expires: Date.now() + CACHE_TIME_MS };
        return rows;
      }).finally(() => { pending = null; });
    }
    const rows = await pending;
    return parseRequired(rows, station);
  }
  return parseRequired(cache.rows, station);
}

function parseRequired(rows: unknown, station: MetarStation): ObservedPoint[] {
  const points = parseMetarTemperatures(rows, station);
  if (points.length === 0) throw new ApiError(422, 'Brak prawidłowych obserwacji temperatury dla wybranej stacji.');
  return points.slice(-100);
}
