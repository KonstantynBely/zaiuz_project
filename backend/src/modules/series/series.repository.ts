import type { Pool } from 'pg';
import { transaction } from '../../common/transaction.js';
import type { SeriesInput } from './series.schema.js';

export interface SeriesRow {
  id: string; name: string; min_value: number; max_value: number;
  color: string; icon?: string | null; unit?: string | null;
}
const select = 'id::text, name, min_value, max_value, color, icon, unit';

export function createSeriesRepository(pool: Pool) {
  return {
    async findAll(): Promise<SeriesRow[]> {
      return (await pool.query<SeriesRow>(`SELECT ${select} FROM series ORDER BY id`)).rows;
    },
    async findById(id: string): Promise<SeriesRow | null> {
      return (await pool.query<SeriesRow>(`SELECT ${select} FROM series WHERE id=$1`, [id])).rows[0] ?? null;
    },
    async insert(data: SeriesInput): Promise<SeriesRow> {
      const result = await pool.query<SeriesRow>(
        `INSERT INTO series (name,min_value,max_value,color,icon,unit)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${select}`,
        [data.name, data.minValue, data.maxValue, data.color, data.icon ?? null, data.unit ?? null],
      );
      return result.rows[0]!;
    },
    async update(id: string, data: SeriesInput): Promise<'not_found' | 'conflict' | SeriesRow> {
      return transaction(pool, async client => {
        // Wstawianie wyników blokuje ten sam wiersz serii, dzięki czemu walidacja
        // zakresu i aktualizacja nie mogą minąć się przy współbieżnych żądaniach.
        const locked = await client.query('SELECT id FROM series WHERE id=$1 FOR UPDATE', [id]);
        if (!locked.rowCount) return 'not_found';
        const outside = await client.query(
          'SELECT 1 FROM measurements WHERE series_id=$1 AND (value<$2 OR value>$3) LIMIT 1',
          [id, data.minValue, data.maxValue],
        );
        if (outside.rowCount) return 'conflict';
        const result = await client.query<SeriesRow>(
          `UPDATE series SET name=$2,min_value=$3,max_value=$4,color=$5,icon=$6,unit=$7
           WHERE id=$1 RETURNING ${select}`,
          [id, data.name, data.minValue, data.maxValue, data.color, data.icon ?? null, data.unit ?? null],
        );
        return result.rows[0]!;
      });
    },
    async remove(id: string): Promise<boolean> {
      return transaction(pool, async client => {
        const result = await client.query('DELETE FROM series WHERE id=$1 RETURNING id', [id]);
        return (result.rowCount ?? 0) > 0;
      });
    },
  };
}
export type SeriesRepository = ReturnType<typeof createSeriesRepository>;
