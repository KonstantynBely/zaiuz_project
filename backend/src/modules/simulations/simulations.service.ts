import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../common/errors.js';
import { parseId } from '../../common/validation.js';
import type { SeriesService } from '../series/series.service.js';
import type { SensorsService } from '../sensors/sensors.service.js';
import type { SimulationsRepository, SimulationRow } from './simulations.repository.js';
import type { SimulationInput, SimulationParameters, SimulationState } from './simulations.schema.js';
import { loadMetarTemperatures, type MetarStation, type ObservedPoint } from './metar.source.js';

interface Job { controller:AbortController; finished:Promise<void> }
export const MAX_CONCURRENT_SIMULATIONS = 4;

function expose(row:SimulationRow) {
  return {
    id:row.id,seriesId:row.series_id,sensorId:row.sensor_id,state:row.state,
    parameters:row.parameters,acceptedCount:row.accepted_count,rejectedCount:row.rejected_count,
    startedAt:row.started_at?.toISOString()??null,finishedAt:row.finished_at?.toISOString()??null,
    error:row.error_summary,
  };
}
function rangeCheck(params:SimulationParameters,series:{minValue:number;maxValue:number}) {
  if (!Number.isFinite(params.min)||!Number.isFinite(params.max)||
      params.min>=params.max||params.min<series.minValue||params.max>series.maxValue) {
    throw new ApiError(422,'Przedział symulacji musi mieścić się w zakresie serii');
  }
}
function makeValue(params:SimulationParameters,index:number):number {
  const ratio=params.pattern==='random' ? Math.random() :
    0.5+0.5*Math.sin(index*2*Math.PI/Math.max(params.count-1,2));
  return params.min+(params.max-params.min)*ratio;
}
function pause(ms:number,signal:AbortSignal):Promise<void> {
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new Error('Zatrzymano symulację'));return;}
    const id=setTimeout(()=>{signal.removeEventListener('abort',aborted);resolve();},ms);
    function aborted(){clearTimeout(id);reject(new Error('Zatrzymano symulację'));}
    signal.addEventListener('abort',aborted,{once:true});
  });
}

/** Jednoproceseowy wykonawca trzyma klucz tylko w pamięci do końca zadania. */
export function createSimulationsService(
  app:FastifyInstance, repo:SimulationsRepository, series:SeriesService,sensors:SensorsService,
  loadObserved: (station: MetarStation) => Promise<ObservedPoint[]> = loadMetarTemperatures,
) {
  const jobs=new Map<string,Job>();
  // Rezerwacje obejmują żądania Start, które wciąż pobierają dane lub tworzą sensor.
  // Zwiększamy licznik synchronicznie przed pierwszym await, więc żądania nie omijają limitu.
  let pendingStarts=0;

  async function execute(id:string,sensorId:string,key:string,params:SimulationParameters,signal:AbortSignal, observations:ObservedPoint[] | null) {
    let finalState:SimulationState='completed';
    let errorMessage:string|undefined;
    try {
      await repo.changeState(id,'running');
      const address=app.server.address();
      if (!address || typeof address==='string')throw new Error('Serwer HTTP nie jest gotowy');
      const url=`http://127.0.0.1:${address.port}/api/measurements`;
      const baseline=Date.now();
      for(let i=0;i<params.count;i++) {
        if(signal.aborted){finalState='stopped';break;}
        const value=observations ? observations[i]!.value : makeValue(params,i);
        const timestamp=params.mode==='history' ?
          observations ? observations[i]!.timestamp :
            new Date(baseline-(params.count-i)*params.intervalMs).toISOString() : undefined;
        const res=await fetch(url,{
          method:'POST',headers:{'Content-Type':'application/json','X-API-Key':key},
          body:JSON.stringify({value,...(timestamp?{timestamp}:{})}),signal,
        });
        // Zwolnij połączenie HTTP po każdym POST, zanim wykonawca przejdzie dalej.
        await res.arrayBuffer();
        await repo.count(id,res.ok);
        if(!res.ok && res.status===401)throw new Error('Klucz czujnika został unieważniony');
        if(i<params.count-1 && params.mode==='live')await pause(params.intervalMs,signal);
      }
    } catch(error) {
      finalState=signal.aborted?'stopped':'failed';
      errorMessage=error instanceof Error?error.message:'Nieznany błąd symulacji';
    } finally {
      try {await sensors.revoke(sensorId);} catch { /* Sensor może zostać usunięty razem z serią. */ }
      try {await repo.changeState(id,finalState,errorMessage);} catch { /* Seria mogła zostać usunięta. */ }
      jobs.delete(id);
    }
  }
  return {
    async list() {return (await repo.list()).map(expose);},
    async get(id:string) {
      const row=await repo.get(parseId(id));
      if(!row)throw new ApiError(404,'Nie znaleziono symulacji');
      return expose(row);
    },
    async start(input:SimulationInput) {
      if(jobs.size+pendingStarts>=MAX_CONCURRENT_SIMULATIONS) {
        throw new ApiError(409,'Osiągnięto limit czterech aktywnych lub przygotowywanych symulacji.');
      }
      pendingStarts++;
      try {
        const seriesId=parseId(String(input.seriesId));
        const target=await series.get(seriesId);
        const observed = input.pattern === 'observed';
        if (observed && !input.station) throw new ApiError(422, 'Wybierz stację pomiarową.');
        if (!observed && input.station) throw new ApiError(422, 'Stacja jest dostępna tylko dla obserwacji METAR.');
        if (observed && !['°C', 'C'].includes(target.unit ?? '')) {
          throw new ApiError(422, 'Obserwacje temperatury wymagają serii w °C.');
        }
        // Pobranie danych odbywa się na starcie, przed rejestracją sensora.
        const observations = observed ? await loadObserved(input.station!) : null;
        if (observations && observations.length === 0) throw new ApiError(422, 'Brak dostępnych obserwacji.');
        const params:SimulationParameters={
          mode:input.mode,pattern:input.pattern,
          count:observations ? observations.length : input.count??60,
          intervalMs:input.intervalMs??1000,
          min:observed ? target.minValue : input.min??target.minValue,
          max:observed ? target.maxValue : input.max??target.maxValue,
          ...(observed ? {station:input.station!,source:'AWC METAR' as const} : {}),
        };
        if (!observed) rangeCheck(params,target);
        const sensor=await sensors.register({name:input.name??`Symulator ${new Date().toISOString()}`,seriesId});
        let row:SimulationRow;
        try {row=await repo.create(seriesId,sensor.id,params);}
        catch(error){await sensors.revoke(sensor.id);throw error;}
        const controller=new AbortController();
        const finished=execute(row.id,sensor.id,sensor.apiKey,params,controller.signal,observations);
        jobs.set(row.id,{controller,finished});
        return expose(row);
      } finally {pendingStarts--;}
    },
    async stop(id:string) {
      const numeric=parseId(id);
      const job=jobs.get(numeric);
      if(job){
        job.controller.abort();
        await job.finished;
      }
      return this.get(numeric);
    },
    async close() {
      const running=[...jobs.values()];
      running.forEach(x=>x.controller.abort());
      await Promise.allSettled(running.map(x=>x.finished));
    },
  };
}
export type SimulationsService=ReturnType<typeof createSimulationsService>;
