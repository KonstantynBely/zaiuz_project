export type SimulationState = 'pending'|'running'|'stopping'|'stopped'|'completed'|'failed';
export interface SimulationInput {
  seriesId: string | number;
  name?: string;
  mode: 'history' | 'live';
  pattern: 'random' | 'sine';
  count?: number;
  intervalMs?: number;
  min?: number;
  max?: number;
}
export interface SimulationParameters {
  mode: SimulationInput['mode']; pattern: SimulationInput['pattern'];
  count: number; intervalMs: number; min: number; max: number;
}

/** Kontrola schematu zapobiega uruchamianiu nieznanych programów przez API. */
export const startSimulationSchema = {
  type:'object', additionalProperties:false, required:['seriesId','mode','pattern'],
  properties:{
    seriesId:{anyOf:[{type:'string',pattern:'^[1-9][0-9]*$'},{type:'integer',minimum:1}]},
    name:{type:'string',minLength:1,maxLength:100},
    mode:{type:'string',enum:['history','live']},
    pattern:{type:'string',enum:['random','sine']},
    count:{type:'integer',minimum:1,maximum:1000},
    intervalMs:{type:'integer',minimum:200,maximum:60000},
    min:{type:'number'},max:{type:'number'},
  },
} as const;
