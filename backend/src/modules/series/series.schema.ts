export interface SeriesInput {
  name: string;
  minValue: number;
  maxValue: number;
  color: string;
  unit?: string | null;
  icon?: string | null;
}

export const seriesBodySchema = {
  type: 'object', additionalProperties: false,
  required: ['name', 'minValue', 'maxValue', 'color'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    minValue: { type: 'number' }, maxValue: { type: 'number' },
    color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
    unit: { type: ['string', 'null'], maxLength: 20 },
    icon: { type: ['string', 'null'], maxLength: 60 },
  },
} as const;
