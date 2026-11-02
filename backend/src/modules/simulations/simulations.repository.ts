import type { Pool } from 'pg';
import { transaction } from '../../common/transaction.js';
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
    /**
     * Pobiera wszystkie aktywne zadania oraz maksymalnie 100 najnowszych zakończonych.
     * Limit historii nie może ukryć nadal działającej symulacji; wynik jest malejący po ID.
     */
    async list():Promise<SimulationRow[]> {
      return (await pool.query<SimulationRow>(
        `SELECT ${projection} FROM simulation_runs
         WHERE state IN ('pending','running','stopping') OR id IN (
           SELECT id FROM simulation_runs WHERE state IN ('stopped','completed','failed')
           ORDER BY id DESC LIMIT 100
         ) ORDER BY id DESC`,
      )).rows;
    },
    /**
     * Odczytuje uruchomienie po ID.
     * @returns Wiersz z parametrami i licznikami lub null.
     */
    async get(id:string):Promise<SimulationRow|null> {
      return (await pool.query<SimulationRow>(`SELECT ${projection} FROM simulation_runs WHERE id=$1`,[id])).rows[0]??null;
    },
    /**
     * Zapisuje uruchomienie w stanie pending z parametrami JSONB i odczytuje pełny wiersz.
     * Czujnik musi zostać wcześniej zarejestrowany przez REST.
     */
    async create(seriesId:string,sensorId:string,params:SimulationParameters):Promise<SimulationRow> {
      const result=await pool.query<{id:string}>(
        `INSERT INTO simulation_runs(series_id,sensor_id,state,parameters)
         VALUES($1,$2,'pending',$3::jsonb) RETURNING id::text`,[seriesId,sensorId,JSON.stringify(params)]);
      return (await this.get(result.rows[0]!.id))!;
    },
    /**
     * Aktualizuje stan, odpowiednie daty i opcjonalną przyczynę błędu.
     * Nie pozwala, by spóźnione stopping nadpisało stan już zakończonego zadania.
     */
    async changeState(id:string,state:SimulationState,reason?:string) {
      await pool.query(
        `UPDATE simulation_runs SET state=$2,
          started_at=CASE WHEN $2='running' THEN COALESCE(started_at,now()) ELSE started_at END,
          finished_at=CASE WHEN $2 IN ('stopped','completed','failed') THEN now() ELSE finished_at END,
          error_summary=COALESCE($3,error_summary) WHERE id=$1
          AND ($2 <> 'stopping' OR state IN ('pending','running'))`,[id,state,reason??null]);
    },
    async count(id:string,accepted:boolean) {
      await pool.query(
        accepted ? 'UPDATE simulation_runs SET accepted_count=accepted_count+1 WHERE id=$1' :
          'UPDATE simulation_runs SET rejected_count=rejected_count+1 WHERE id=$1',[id]);
    },
    async requestCleanup(sensorId: string) {
      await pool.query('UPDATE simulation_sensor_cleanup SET ready=true WHERE sensor_id=$1', [sensorId]);
    },
    /**
     * Wybiera do 20 sensorów gotowych do sprzątania lub powiązanych z zakończonym zadaniem.
     * Drugi warunek pozwala ponowić sprzątanie nawet po błędzie ustawiania ready.
     */
    async pendingCleanup(): Promise<string[]> {
      const rows = await pool.query<{sensor_id:string}>(
        `SELECT q.sensor_id::text FROM simulation_sensor_cleanup q
         WHERE q.ready=true OR EXISTS (SELECT 1 FROM simulation_runs r
           WHERE r.sensor_id=q.sensor_id AND r.state IN ('failed','completed','stopped'))
         ORDER BY q.sensor_id LIMIT 20`);
      return rows.rows.map( row => row.sensor_id);
    },
    /**
     * Przed otwarciem HTTP oznacza niedokończone zadania jako failed i cofa klucze sensorów z kolejki.
     * Operacja jest transakcyjna i obejmuje całą kolejkę bazy; zakłada jeden proces wykonawcy.
     */
    async recoverOrphans() {
      await transaction(pool, async client => {
        await client.query(`
          UPDATE simulation_runs SET state='failed',finished_at=now(),
            error_summary='Przerwano podczas restartu usługi'
          WHERE state IN ('pending','running','stopping')`);
        await client.query(`UPDATE sensors SET revoked_at=now() WHERE id IN
          (SELECT sensor_id FROM simulation_sensor_cleanup) AND revoked_at IS NULL`);
        await client.query('DELETE FROM simulation_sensor_cleanup');
      });
    },
  };
}
export type SimulationsRepository=ReturnType<typeof createSimulationsRepository>;
