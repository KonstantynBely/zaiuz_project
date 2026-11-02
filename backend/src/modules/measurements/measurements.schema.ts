export interface MeasurementInput { value:number; timestamp?:string }
export interface MeasurementQuery { series?:string; from?:string; to?:string; sort?:'timestamp'|'-timestamp'; limit?:string }
export const measurementBodySchema = {
  type:'object', required:['value'], additionalProperties:false,
  properties:{ value:{type:'number'},timestamp:{type:'string'} },
} as const;
