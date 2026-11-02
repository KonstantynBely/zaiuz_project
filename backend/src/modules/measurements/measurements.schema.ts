/** Dane zapisu pomiaru; serię wyznacza klucz czujnika, a brak timestamp oznacza czas serwera. */
export interface MeasurementInput { value:number; timestamp?:string }
/** Surowe tekstowe filtry odczytu z URL; parseMeasurementQuery wykonuje walidację i konwersję. */
export interface MeasurementQuery { series?:string; from?:string; to?:string; sort?:'timestamp'|'-timestamp'; limit?:string }
/** Schemat walidacji JSON dla zapisu pomiaru. Typy i wymagane pola sprawdza Fastify przed handlerem; reguły domenowe weryfikuje serwis. */
export const measurementBodySchema = {
  type:'object', required:['value'], additionalProperties:false,
  properties:{ value:{type:'number'},timestamp:{type:'string'} },
} as const;
