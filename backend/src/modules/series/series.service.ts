import type { SeriesRepository } from './series.repository.js';

/** Pola odpowiedzi zachowują nazwy z kontraktu prowadzącego. */
function asSeries(row: Awaited<ReturnType<SeriesRepository['findAll']>>[number]) {
  return {
    id: row.id,
    name: row.name,
    minValue: row.min_value,
    maxValue: row.max_value,
    color: row.color,
  };
}

export function createSeriesService(repository: SeriesRepository) {
  return {
    async list() { return (await repository.findAll()).map(asSeries); },
    async get(id: string) {
      const row = await repository.findById(id);
      return row ? asSeries(row) : null;
    },
  };
}
export type SeriesService = ReturnType<typeof createSeriesService>;
