import type { Pool } from 'pg';

export interface SeriesRow {
  id: string;
  name: string;
  min_value: number;
  max_value: number;
  color: string;
}

export function createSeriesRepository(pool: Pool) {
  return {
    async findAll(): Promise<SeriesRow[]> {
      const result = await pool.query<SeriesRow>(
        'SELECT id::text, name, min_value, max_value, color FROM series ORDER BY id',
      );
      return result.rows;
    },
    async findById(id: string): Promise<SeriesRow | null> {
      const result = await pool.query<SeriesRow>(
        'SELECT id::text, name, min_value, max_value, color FROM series WHERE id = $1',
        [id],
      );
      return result.rows[0] ?? null;
    },
  };
}
export type SeriesRepository = ReturnType<typeof createSeriesRepository>;
