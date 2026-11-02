import { ApiError } from '../../common/errors.js';

/** Rzeczywiste obserwacje temperatury METAR ze stacji lotniczych (°C). */
const METAR_STATIONS = ['EPWA', 'EPKK', 'EPGD'] as const;
/** Identyfikator jednej z trzech obsługiwanych stacji lotniczych. */
export type MetarStation = typeof METAR_STATIONS[number];
/** Rzeczywista temperatura z oryginalnym czasem obserwacji zapisanym jako ISO UTC. */
export interface ObservedPoint { value: number; timestamp: string }

/** Niezaufany rekord zewnętrznego JSON; pola unknown wymagają sprawdzenia przed użyciem. */
interface MetarRow { icaoId?: unknown; obsTime?: unknown; temp?: unknown }
const STATIONS = new Set<string>(METAR_STATIONS);
/** Stałe źródło obserwacji; parametrów URL nie buduje się z niezaufanego wejścia użytkownika. */
const SOURCE_URL = 'https://aviationweather.gov/api/data/metar?ids=EPWA%2CEPKK%2CEPGD&format=json&hours=24';
/** Czas cache w milisekundach, wspólny dla stacji pobieranych w jednym żądaniu. */
const CACHE_TIME_MS = 60_000;
/** Cache tylko bieżącego procesu; expires jest czasem epoch w milisekundach. */
let cache: { expires: number; rows: MetarRow[] } | null = null;
/** Jedno współdzielone pobieranie zapobiega równoległym żądaniom przy pustym lub wygasłym cache. */
let pending: Promise<MetarRow[]> | null = null;

/**
 * Wybiera skończone temperatury wskazanej stacji z odpowiedzi METAR.
 * Odrzuca błędne czasy, deduplikuje chwile obserwacji i sortuje rosnąco; nie interpoluje braków.
 * @returns Obserwacje z czasem ISO UTC.
 * @throws ApiError 503, jeśli odpowiedź nie jest tablicą.
 */
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
  return [...unique.entries()].sort(/** Porządkuje obserwacje rosnąco według czasu w kluczu mapy. */ (a, b) => a[0] - b[0]).map(/** Zwraca obserwację po uporządkowaniu mapy według czasu. */ ([, value]) => value);
}

/**
 * Pobiera JSON obserwacji trzech stacji z ostatnich 24 h z timeoutem 8 s.
 * Sprawdza status, rozmiar odczytanego tekstu i kształt odpowiedzi.
 * @throws ApiError 503 przy awarii sieci, parsera lub niepoprawnej odpowiedzi.
 */
async function fetchSource(): Promise<MetarRow[]> {
  const controller = new AbortController();
  const timeout = setTimeout(/** Przerywa zbyt długo trwające pobieranie danych zewnętrznych. */ () => controller.abort(), 8000);
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

/**
 * Udostępnia obserwacje stacji ze wspólnego cache ważnego 60 s.
 * Równoległe żądania współdzielą trwające pobieranie; nieudana próba nie pozostaje w pending.
 * @throws ApiError 422 dla nieznanej stacji/braku obserwacji lub 503 przy awarii źródła.
 */
export async function loadMetarTemperatures(station: MetarStation): Promise<ObservedPoint[]> {
  if (!STATIONS.has(station)) throw new ApiError(422, 'Nieznana stacja meteorologiczna.');
  if (!cache || cache.expires < Date.now()) {
    if (!pending) {
      pending = fetchSource().then(/** Zapisuje pobrane obserwacje w cache z nowym terminem ważności. */ rows => {
        cache = { rows, expires: Date.now() + CACHE_TIME_MS };
        return rows;
      }).finally(/** Zwalnia wspólną referencję trwającego pobrania, również po błędzie źródła. */ () => { pending = null; });
    }
    const rows = await pending;
    return parseRequired(rows, station);
  }
  return parseRequired(cache.rows, station);
}

/** Wymaga przynajmniej jednej poprawnej obserwacji i wybiera do 100 najnowszych w porządku chronologicznym. */
function parseRequired(rows: unknown, station: MetarStation): ObservedPoint[] {
  const points = parseMetarTemperatures(rows, station);
  if (points.length === 0) throw new ApiError(422, 'Brak prawidłowych obserwacji temperatury dla wybranej stacji.');
  return points.slice(-100);
}
