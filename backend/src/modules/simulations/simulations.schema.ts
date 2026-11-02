import type { MetarStation } from './metar.source.js';
/** Stan cyklu życia zadania, obejmujący przygotowanie, wykonywanie, zatrzymywanie i trzy stany końcowe. */
export type SimulationState = 'pending'|'running'|'stopping'|'stopped'|'completed'|'failed';
/** Parametry nowego zadania; dla observed wymagane jest station, a count i zakres wynikają z obserwacji oraz serii. */
export interface SimulationInput {
  seriesId: string | number;
  name?: string;
  mode: 'history' | 'live';
  pattern: 'random' | 'sine' | 'observed';
  station?: MetarStation;
  count?: number;
  intervalMs?: number;
  min?: number;
  max?: number;
}
/** Znormalizowane parametry zapisane z uruchomieniem; interwał jest podany w milisekundach. */
export interface SimulationParameters {
  mode: SimulationInput['mode']; pattern: SimulationInput['pattern'];
  count: number; intervalMs: number; min: number; max: number;
  station?: MetarStation; source?: 'AWC METAR';
}

/** Schemat walidacji JSON dla uruchomienia symulacji. Typy i wymagane pola sprawdza Fastify przed handlerem; reguły domenowe weryfikuje serwis. */
export const startSimulationSchema = {
  type:'object', additionalProperties:false, required:['seriesId','mode','pattern'],
  properties:{
    seriesId:{anyOf:[{type:'string',pattern:'^[1-9][0-9]*$'},{type:'integer',minimum:1}]},
    name:{type:'string',minLength:1,maxLength:100},
    mode:{type:'string',enum:['history','live']},
    pattern:{type:'string',enum:['random','sine','observed']},
    station:{type:'string',enum:['EPWA','EPKK','EPGD']},
    count:{type:'integer',minimum:1,maximum:1000},
    intervalMs:{type:'integer',minimum:200,maximum:60000},
    min:{type:'number'},max:{type:'number'},
  },
} as const;
