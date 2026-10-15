import { ApiError } from '../../common/errors.js';
import type { SeriesRepository, SeriesRow } from './series.repository.js';
import type { SeriesInput } from './series.schema.js';

function asSeries(row: SeriesRow) {
  return {
    id: row.id, name: row.name, minValue: row.min_value, maxValue: row.max_value,
    color: row.color, ...(row.icon == null ? {} : { icon: row.icon }),
    ...(row.unit == null ? {} : { unit: row.unit }),
  };
}
function validateRange(input: SeriesInput) {
  if (!Number.isFinite(input.minValue) || !Number.isFinite(input.maxValue) || input.minValue >= input.maxValue) {
    throw new ApiError(422, 'Wartość minValue musi być mniejsza od maxValue');
  }
}

export function createSeriesService(repository: SeriesRepository) {
  return {
    async list() { return (await repository.findAll()).map(asSeries); },
    async get(id: string) {
      const row = await repository.findById(id);
      if (!row) throw new ApiError(404, 'Nie znaleziono serii');
      return asSeries(row);
    },
    async create(input: SeriesInput) {
      validateRange(input);
      return asSeries(await repository.insert(input));
    },
    async update(id: string, input: SeriesInput) {
      validateRange(input);
      const result = await repository.update(id, input);
      if (result === 'not_found') throw new ApiError(404, 'Nie znaleziono serii');
      if (result === 'conflict') throw new ApiError(409, 'Nowy zakres wyklucza istniejące pomiary');
      return asSeries(result);
    },
    async remove(id: string) {
      if (!await repository.remove(id)) throw new ApiError(404, 'Nie znaleziono serii');
    },
  };
}
export type SeriesService = ReturnType<typeof createSeriesService>;
