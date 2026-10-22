import type { Measurement } from '../../api/client';

export type MeasurementRange = 'all' | '24h' | '7d' | '30d' | 'custom';

export interface StreamFilter {
  range: MeasurementRange;
  from?: string;
  to?: string;
  hiddenSeriesIds: readonly string[];
  availableSeriesIds: readonly string[];
}

/**
 * SSE to tylko nowy pomiar, nie kompletna historia. Zdarzenia spoza obecnie
 * wybranego zakresu i serii nie mogą wypierać wyników pobranych przez REST.
 */
export function matchesStreamFilter(item: Measurement, filter: StreamFilter, now: number): boolean {
  if (!item || !item.id || !item.seriesId || typeof item.value !== 'number' ||
      !Number.isFinite(item.value)) return false;
  const seriesId = String(item.seriesId);
  if (filter.hiddenSeriesIds.includes(seriesId) || !filter.availableSeriesIds.includes(seriesId)) return false;

  const timestamp = Date.parse(item.timestamp);
  if (!Number.isFinite(timestamp)) return false;
  if (filter.range === 'custom') {
    const from = filter.from ? Date.parse(filter.from) : -Infinity;
    const to = filter.to ? Date.parse(filter.to) : Infinity;
    return timestamp >= from && timestamp <= to;
  }
  if (filter.range !== 'all') {
    const days = filter.range === '24h' ? 1 : filter.range === '7d' ? 7 : 30;
    if (timestamp < now - days * 86_400_000) return false;
  }
  return true;
}

export function appendStreamMeasurement(
  previous: Measurement[], item: Measurement, filter: StreamFilter, now: number,
  limit = 1000,
): Measurement[] {
  if (!matchesStreamFilter(item, filter, now) ||
      previous.some(existing => String(existing.id) === String(item.id))) return previous;
  return [item, ...previous]
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, limit);
}
