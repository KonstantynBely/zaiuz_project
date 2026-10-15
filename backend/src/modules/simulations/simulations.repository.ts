import type { Pool } from 'pg';
import type { SimulationParameters, SimulationState } from './simulations.schema.js';

export interface SimulationRow {
  id:string;series_id:string;sensor_id:string|null;
  state:SimulationState;parameters:SimulationParameters;
  accepted_count:number;rejected_count:number;
  started_at:Date|null;finished_at:Date|null;error_summary:string|null;
}
const projection='id::text,series_id::text,sensor_id::text,state,parameters,accepted_count,rejected_count,started_at,finished_at,error_summary';

export function createSimulationsRepository(pool: Pool) {
  return {
    async list():Promise<SimulationRow[]> {
      return (await pool.query<SimulationRow>(`SELECT ${projection} FROM simulation_runs ORDER BY id DESC LIMIT 100`)).rows;
    },
    async get(id:string):Promise<SimulationRow|null> {
      return (await pool.query<SimulationRow>(`SELECT ${projection} FROM simulation_runs WHERE id=$1`,[id])).rows[0]??null;
    },
    async create(seriesId:string,sensorId:string,params:SimulationParameters):Promise<SimulationRow> {
      const result=await pool.query<{id:string}>(
        `INSERT INTO simulation_runs(series_id,sensor_id,state,parameters)
         VALUES($1,$2,'pending',$3::jsonb) RETURNING id::text`,[seriesId,sensorId,JSON.stringify(params)]);
      return (await this.get(result.rows[0]!.id))!;
    },
    async changeState(id:string,state:SimulationState,reason?:string) {
      await pool.query(
        `UPDATE simulation_runs SET state=$2,
          started_at=CASE WHEN $2='running' THEN COALESCE(started_at,now()) ELSE started_at END,
          finished_at=CASE WHEN $2 IN ('stopped','completed','failed') THEN now() ELSE finished_at END,
          error_summary=COALESCE($3,error_summary) WHERE id=$1`,[id,state,reason??null]);
    },
    async count(id:string,accepted:boolean) {
      await pool.query(
        accepted ? 'UPDATE simulation_runs SET accepted_count=accepted_count+1 WHERE id=$1' :
          'UPDATE simulation_runs SET rejected_count=rejected_count+1 WHERE id=$1',[id]);
    },
    /** Po awarii procesu nie pozostają zadania bez workera ani ważne klucze. */
    async recoverOrphans() {
      await pool.query(`WITH orphaned AS (
        UPDATE simulation_runs SET state='failed',finished_at=now(),
          error_summary='Przerwano podczas restartu usługi'
        WHERE state IN ('pending','running','stopping') RETURNING sensor_id
      ) UPDATE sensors SET revoked_at=now() WHERE id IN
        (SELECT sensor_id FROM orphaned WHERE sensor_id IS NOT NULL) AND revoked_at IS NULL`);
    },
  };
}
export type SimulationsRepository=ReturnType<typeof createSimulationsRepository>;
