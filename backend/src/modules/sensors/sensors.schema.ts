/** Dane rejestracji czujnika; wskazana seria musi istnieć, a jej ID mieścić się w BIGINT. */
export interface SensorInput { name: string; seriesId: string | number }
/** Schemat walidacji JSON dla rejestracji czujnika. Typy i wymagane pola sprawdza Fastify przed handlerem; reguły domenowe weryfikuje serwis. */
export const sensorBodySchema = {
  type: 'object', required: ['name','seriesId'], additionalProperties: false,
  properties: {
    name: { type:'string', minLength:1, maxLength:100 },
    seriesId: { anyOf: [{ type: 'integer', minimum:1 }, { type:'string', pattern:'^[1-9][0-9]*$' }] },
  },
} as const;
