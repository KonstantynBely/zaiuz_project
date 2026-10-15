import { createHash } from 'node:crypto';
import { ApiError } from '../../common/errors.js';
import { parseTimestamp } from '../../common/validation.js';
import type { MeasurementInput, MeasurementQuery } from './measurements.schema.js';
import type { MeasurementRow, MeasurementsRepository } from './measurements.repository.js';

function expose(row:MeasurementRow) {
  return {id:row.id,seriesId:row.series_id,
    ...(row.sensor_id===null?{}:{sensorId:row.sensor_id}),value:row.value,
    timestamp:row.timestamp.toISOString()};
}

/** Czas i numeryczne ID walidowane przed SQL — parametry są przekazywane osobno. */
export function parseMeasurementQuery(query:MeasurementQuery) {
  const series = query.series ? query.series.split(',') : undefined;
  if (series?.some(x=>!/^[1-9]\d*$/.test(x))) throw new ApiError(400,'Niepoprawna lista serii');
  const from = query.from===undefined?undefined:parseTimestamp(query.from);
  const to = query.to===undefined?undefined:parseTimestamp(query.to);
  if(from && to && from>to)throw new ApiError(400,'Parametr from nie może być późniejszy niż to');
  const sort=query.sort??'timestamp';
  if(sort!=='timestamp'&&sort!=='-timestamp')throw new ApiError(400,'Niepoprawny parametr sort');
  const limit=query.limit===undefined?1000:Number(query.limit);
  if(!Number.isInteger(limit)||limit<1||limit>10000)throw new ApiError(400,'Limit musi być w przedziale 1–10000');
  return {series,from,to,sort,limit};
}

export function createMeasurementsService(repo:MeasurementsRepository,onCreated?:(measurement:ReturnType<typeof expose>)=>void) {
  return {
    async list(query:MeasurementQuery) { return (await repo.list(parseMeasurementQuery(query))).map(expose); },
    async get(id:string) {
      const measurement=await repo.findById(id);
      if(!measurement)throw new ApiError(404,'Nie znaleziono pomiaru');
      return expose(measurement);
    },
    async create(key:string|undefined,input:MeasurementInput) {
      if(!key || key.length<32)throw new ApiError(401,'Nieprawidłowy klucz czujnika');
      const timestamp=input.timestamp ? parseTimestamp(input.timestamp) : new Date();
      const hashed=createHash('sha256').update(key).digest('hex');
      const result=await repo.insertWithKey(hashed,input.value,timestamp);
      if('row' in result){const measurement=expose(result.row);onCreated?.(measurement);return measurement;}
      if(result.error==='auth')throw new ApiError(401,'Klucz czujnika jest niepoprawny lub wyrejestrowany');
      const detail=result.error==='range'?'Wartość pomiaru jest poza zakresem serii':
        'Znacznik czasu pomiaru jest późniejszy o ponad 5 minut';
      await repo.logRejection(result.sensorId??null,422,detail);
      throw new ApiError(422,detail);
    },
  };
}
export type MeasurementsService=ReturnType<typeof createMeasurementsService>;
