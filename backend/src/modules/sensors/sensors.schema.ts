export interface SensorInput { name: string; seriesId: string | number }
export const sensorBodySchema = {
  type: 'object', required: ['name','seriesId'], additionalProperties: false,
  properties: {
    name: { type:'string', minLength:1, maxLength:100 },
    seriesId: { anyOf: [{ type: 'integer', minimum:1 }, { type:'string', pattern:'^[1-9][0-9]*$' }] },
  },
} as const;
