import { ApiError } from './errors.js';

export const idSchema = { type: 'string', pattern: '^[1-9][0-9]*$' } as const;
export const pathIdSchema = (name: string) => ({
  type: 'object', required: [name], additionalProperties: false,
  properties: { [name]: idSchema },
});

/** Interpretacja API datetime wymaga jawnej strefy, nie lokalnego czasu serwera. */
export function parseTimestamp(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new ApiError(400, 'Data musi zawierać pełny czas oraz strefę czasową');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, 'Niepoprawna data');
  return date;
}

/** Id w URL jest sprawdzany osobno, aby nie ujawniać szczegółów bazy. */
export function parseId(value: string): string {
  if (!/^[1-9]\d*$/.test(value)) throw new ApiError(404, 'Nie znaleziono zasobu');
  return value;
}
