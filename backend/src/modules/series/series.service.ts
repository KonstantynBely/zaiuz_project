import { ApiError } from '../../common/errors.js';
import type { SeriesRepository, SeriesRow } from './series.repository.js';
import type { SeriesInput } from './series.schema.js';

/** Mapuje nazwy kolumn SQL na kontrakt serii i pomija opcjonalne pola NULL. */
function asSeries(row: SeriesRow) {
  return {
    id: row.id, name: row.name, minValue: row.min_value, maxValue: row.max_value,
    color: row.color, ...(row.icon == null ? {} : { icon: row.icon }),
    ...(row.unit == null ? {} : { unit: row.unit }),
  };
}
/**
 * Wymaga skończonych granic minValue < maxValue.
 * @throws ApiError 422, zanim niepoprawny zakres trafi do repozytorium.
 */
function validateRange(input: SeriesInput) {
  if (!Number.isFinite(input.minValue) || !Number.isFinite(input.maxValue) || input.minValue >= input.maxValue) {
    throw new ApiError(422, 'Wartość minValue musi być mniejsza od maxValue');
  }
}

/** Udostępnia CRUD serii z walidacją zakresów i mapowaniem odmów repozytorium na błędy HTTP. */
export function createSeriesService(repository: SeriesRepository) {
  return {
    /** Zwraca wszystkie serie jako obiekty zgodne z publicznym kontraktem. */
    async list() { return (await repository.findAll()).map(asSeries); },
    /**
     * Zwraca publiczny opis wskazanej serii.
     * @throws ApiError 404 dla brakującego zasobu.
     */
    async get(id: string) {
      const row = await repository.findById(id);
      if (!row) throw new ApiError(404, 'Nie znaleziono serii');
      return asSeries(row);
    },
    /** Sprawdza zakres i tworzy serię, zwracając jej publiczny opis. */
    async create(input: SeriesInput) {
      validateRange(input);
      return asSeries(await repository.insert(input));
    },
    /**
     * Waliduje zakres i zastępuje pola serii.
     * @throws ApiError 404 dla braku serii lub 409, gdy zmiana wyklucza zapisane pomiary.
     */
    async update(id: string, input: SeriesInput) {
      validateRange(input);
      const result = await repository.update(id, input);
      if (result === 'not_found') throw new ApiError(404, 'Nie znaleziono serii');
      if (result === 'conflict') throw new ApiError(409, 'Nowy zakres wyklucza istniejące pomiary');
      return asSeries(result);
    },
    /**
     * Usuwa serię i jej zależności zgodnie z kluczami obcymi.
     * @throws ApiError 404, jeśli seria nie istniała.
     */
    async remove(id: string) {
      if (!await repository.remove(id)) throw new ApiError(404, 'Nie znaleziono serii');
    },
  };
}
/** Interfejs serwisu wywnioskowany z jego fabryki; kontrolery zależą od niego zamiast od implementacji SQL. */
export type SeriesService = ReturnType<typeof createSeriesService>;
