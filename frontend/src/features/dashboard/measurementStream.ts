import type { Measurement } from '../../api/client';

export type MeasurementRange = 'all' | '24h' | '7d' | '30d' | 'custom';

export interface StreamFilter {
  range: MeasurementRange;
  from?: string;
  to?: string;
  hiddenSeriesIds: readonly string[];
  availableSeriesIds: readonly string[];
}

export function validMeasurement(item: Measurement | null | undefined): item is Measurement {
  return !!item && item.id != null && item.seriesId != null &&
    typeof item.value === 'number' && Number.isFinite(item.value) &&
    typeof item.timestamp === 'string' && Number.isFinite(Date.parse(item.timestamp));
}

export function compareMeasurements(a: Measurement, b: Measurement): number {
  const times = Date.parse(b.timestamp) - Date.parse(a.timestamp);
  if (times) return times;
  try {
    const x = BigInt(String(a.id));
    const y = BigInt(String(b.id));
    return x > y ? -1 : x < y ? 1 : 0;
  } catch {
    return String(b.id).localeCompare(String(a.id));
  }
}

export function matchesStreamFilter(item: Measurement, filter: StreamFilter, now: number): boolean {
  if (!validMeasurement(item)) return false;
  const id = String(item.seriesId);
  if (!filter.availableSeriesIds.includes(id) || filter.hiddenSeriesIds.includes(id)) return false;
  const stamp = Date.parse(item.timestamp);
  if (filter.range === 'custom') {
    return stamp >= (filter.from ? Date.parse(filter.from) : -Infinity) &&
      stamp <= (filter.to ? Date.parse(filter.to) : Infinity);
  }
  if (filter.range !== 'all') {
    const days = filter.range === '24h' ? 1 : filter.range === '7d' ? 7 : 30;
    return stamp >= now - days * 86_400_000;
  }
  return true;
}

export function reconcileMeasurements(
  fetched: readonly Measurement[], events: readonly Measurement[],
  filter: StreamFilter, now: number, limit = 1000,
): Measurement[] {
  const byId = new Map<string, Measurement>();
  for (const item of [...fetched, ...events]) {
    if (matchesStreamFilter(item, filter, now)) byId.set(String(item.id), item);
  }
  return [...byId.values()].sort(compareMeasurements).slice(0, limit);
}

export function appendStreamMeasurement(
  previous: Measurement[], item: Measurement, filter: StreamFilter, now: number,
  limit = 1000,
): Measurement[] {
  if (!matchesStreamFilter(item, filter, now) ||
    previous.some(previousItem => String(previousItem.id) === String(item.id))) return previous;
  return reconcileMeasurements(previous, [item], filter, now, limit);
}

export function preferLatest(
  previous: Measurement | null | undefined, incoming: Measurement,
): Measurement | null | undefined {
  if (!validMeasurement(incoming)) return previous;
  if (!previous || !validMeasurement(previous)) return incoming;
  return compareMeasurements(incoming, previous) < 0 ? incoming : previous;
}

/**
 * REST returns an authoritative snapshot for one filter generation.
 * Only SSE events received after that generation began are merged with it.
 */
export class TelemetryReconciler {
  private generation = 0;
  private pending: { generation: number; events: Measurement[] } | null = null;
  private rows: Measurement[] = [];
  private filter: StreamFilter = {
    range: 'all', availableSeriesIds: [], hiddenSeriesIds: [],
  };

  begin(filter: StreamFilter, now = Date.now()): number {
    ++this.generation;
    this.filter = filter;
    this.pending = { generation: this.generation, events: [] };
    this.rows = reconcileMeasurements(this.rows, [], filter, now);
    return this.generation;
  }

  receive(item: Measurement, now = Date.now()): Measurement[] {
    if (!validMeasurement(item)) return this.rows;
    // Capture before checking the series list; it can be empty on first load.
    if (this.pending) {
      this.pending.events.push(item);
      if (this.pending.events.length > 1000) {
        const ids = new Map(this.pending.events.map(row => [String(row.id), row]));
        this.pending.events = [...ids.values()].sort(compareMeasurements).slice(0, 1000);
      }
    }
    this.rows = reconcileMeasurements(this.rows, [item], this.filter, now);
    return this.rows;
  }

  finish(generation: number, loaded: readonly Measurement[],
    filter: StreamFilter, now = Date.now()): Measurement[] | null {
    if (!this.pending || this.pending.generation !== generation) return null;
    this.filter = filter;
    this.rows = reconcileMeasurements(loaded, this.pending.events, filter, now);
    this.pending = null;
    return this.rows;
  }

  visible(now = Date.now()): Measurement[] {
    this.rows = reconcileMeasurements(this.rows, [], this.filter, now);
    return this.rows;
  }

  invalidate(): void {
    ++this.generation;
    this.pending = null;
  }
}
