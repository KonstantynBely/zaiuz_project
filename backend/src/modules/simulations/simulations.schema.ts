import type { MetarStation } from './metar.source.js';
export type SimulationState = 'pending'|'running'|'stopping'|'stopped'|'completed'|'failed';
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
export interface SimulationParameters {
  mode: SimulationInput['mode']; pattern: SimulationInput['pattern'];
  count: number; intervalMs: number; min: number; max: number;
  station?: MetarStation; source?: 'AWC METAR';
}

/** Kontrola schematu zapobiega uruchamianiu nieznanych programów przez API. */
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
