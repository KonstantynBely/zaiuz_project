import type { Pool } from 'pg';
import { transaction } from '../../common/transaction.js';

export interface SensorRow {
  id: string; name: string; series_id: string; registered_at: Date;
  last_measurement_at: Date | null;
}
const listColumns = `s.id::text, s.name, s.series_id::text,
  s.registered_at, (SELECT MAX(m.timestamp) FROM measurements m WHERE m.sensor_id=s.id) AS last_measurement_at`;

export function createSensorsRepository(pool: Pool) {
  return {
    async list(): Promise<SensorRow[]> {
      return (await pool.query<SensorRow>(
        `SELECT ${listColumns} FROM sensors s WHERE s.revoked_at IS NULL ORDER BY s.id`,
      )).rows;
    },
    async findById(id: string): Promise<SensorRow | null> {
      return (await pool.query<SensorRow>(
        `SELECT ${listColumns} FROM sensors s WHERE s.id=$1 AND s.revoked_at IS NULL`, [id],
      )).rows[0] ?? null;
    },
    async register(input: { name:string; seriesId:string; keyHash:string; simulationWorker?:boolean }): Promise<SensorRow | null> {
      return transaction(pool, async client => {
        const result = await client.query<SensorRow>(
          `INSERT INTO sensors (name,series_id,api_key_hash)
           SELECT $1,id,$3 FROM series WHERE id=$2
           RETURNING id::text,name,series_id::text,registered_at,NULL::timestamptz AS last_measurement_at`,
          [input.name, input.seriesId, input.keyHash],
        );
        if (!result.rows[0]) return null;
        if (input.simulationWorker) {
          await client.query('INSERT INTO simulation_sensor_cleanup(sensor_id) VALUES($1)', [result.rows[0].id]);
        }
        return result.rows[0];
      });
    },
    async revoke(id: string): Promise<boolean> {
      return transaction(pool, async client => {
        const result = await client.query(
          'UPDATE sensors SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING id', [id],
        );
        await client.query('DELETE FROM simulation_sensor_cleanup WHERE sensor_id=$1', [id]);
        return (result.rowCount ?? 0) > 0;
      });
    },
  };
}
export type SensorsRepository = ReturnType<typeof createSensorsRepository>;
