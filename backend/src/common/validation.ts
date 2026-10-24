import { ApiError } from './errors.js';

export const idSchema = { type: 'string', pattern: '^[1-9][0-9]*$' } as const;
export const pathIdSchema = (name: string) => ({
  type: 'object', required: [name], additionalProperties: false,
  properties: { [name]: idSchema },
});

/** Interpretacja API datetime wymaga jawnej strefy, nie lokalnego czasu serwera. */
export function parseTimestamp(value: string): Date {
  const parts = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/i.exec(value);
  if (!parts) {
    throw new ApiError(400, 'Data musi zawierać pełny czas oraz strefę czasową');
  }
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);
  const second = Number(parts[6]);
  const offsetHour = Number(parts[7] ?? 0);
  const offsetMinute = Number(parts[8] ?? 0);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]! ||
      hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) {
    throw new ApiError(400, 'Niepoprawna data');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, 'Niepoprawna data');
  return date;
}

/** Id w URL jest sprawdzany osobno, aby nie ujawniać szczegółów bazy. */
export function isDatabaseId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) &&
    (value.length < 19 || (value.length === 19 && value <= '9223372036854775807'));
}

export function parseId(value: string, status = 404): string {
  if (!isDatabaseId(value)) throw new ApiError(status, status === 404 ? 'Nie znaleziono zasobu' : 'Niepoprawny identyfikator');
  return value;
}
