import type { Pool } from 'pg';
import { transaction } from '../../common/transaction.js';

export interface MeasurementRow {
  id: string; series_id: string; sensor_id: string | null; value:number; timestamp:Date;
}
interface SensorForWrite {
  id:string; series_id:string; min_value:number; max_value:number;
}
const projection='id::text,series_id::text,sensor_id::text,value,timestamp';

export function createMeasurementsRepository(pool: Pool) {
  return {
    async list(filter:{series?:string[];from?:Date;to?:Date;sort:'timestamp'|'-timestamp';limit:number}):Promise<MeasurementRow[]> {
      const predicates:string[]=[];const values:unknown[]=[];
      if (filter.series) {values.push(filter.series);predicates.push(`series_id = ANY($${values.length}::bigint[])`);}
      if (filter.from) {values.push(filter.from);predicates.push(`timestamp >= $${values.length}`);}
      if (filter.to) {values.push(filter.to);predicates.push(`timestamp <= $${values.length}`);}
      values.push(filter.limit);
      const order=filter.sort==='-timestamp'?'DESC':'ASC';
      const result=await pool.query<MeasurementRow>(
        `SELECT ${projection} FROM measurements ${predicates.length ? 'WHERE '+predicates.join(' AND ') : ''}
         ORDER BY timestamp ${order}, id ${order} LIMIT $${values.length}`,values,
      );
      return result.rows;
    },
    async findById(id:string):Promise<MeasurementRow|null> {
      return (await pool.query<MeasurementRow>(`SELECT ${projection} FROM measurements WHERE id=$1 LIMIT 1`,[id])).rows[0]??null;
    },
    async insertWithKey(hash:string,value:number,timestamp:Date):Promise<
      {row:MeasurementRow} | {error:'auth'|'range'|'future';sensorId?:string} > {
      return transaction(pool,async client=>{
        // FOR UPDATE blokuje serię na czas sprawdzenia i zapisu. Aktualizacja
        // zakresu serii korzysta z tej samej blokady, także między procesami API.
        const lookup=await client.query<SensorForWrite>(
          `SELECT s.id::text, s.series_id::text, se.min_value, se.max_value
           FROM sensors s JOIN series se ON se.id=s.series_id
           WHERE s.api_key_hash=$1 AND s.revoked_at IS NULL
           FOR UPDATE OF s, se`,[hash],
        );
        const sensor=lookup.rows[0];
        if(!sensor)return {error:'auth'};
        if(value<sensor.min_value||value>sensor.max_value)return {error:'range',sensorId:sensor.id};
        if(timestamp.getTime()>Date.now()+5*60_000)return {error:'future',sensorId:sensor.id};
        const result=await client.query<MeasurementRow>(
          `INSERT INTO measurements(series_id,sensor_id,value,timestamp)
           VALUES($1,$2,$3,$4) RETURNING ${projection}`,
          [sensor.series_id,sensor.id,value,timestamp],
        );
        return {row:result.rows[0]!};
      });
    },
    async logRejection(sensorId:string|null,status:number,reason:string) {
      await pool.query('INSERT INTO rejected_measurements(sensor_id,http_status,reason) VALUES($1,$2,$3)',
        [sensorId,status,reason]);
    },
  };
}
export type MeasurementsRepository=ReturnType<typeof createMeasurementsRepository>;
