import type { Measurement } from '../../api/client';

export type MeasurementRange = 'all' | '24h' | '7d' | '30d' | 'custom';

/** Migawka filtrów dla jednej generacji telemetrii; rozróżnia serie znane i ukryte. */
export interface StreamFilter {
  range: MeasurementRange;
  from?: string;
  to?: string;
  hiddenSeriesIds: readonly string[];
  availableSeriesIds: readonly string[];
}

function validMeasurement(item: Measurement | null | undefined): item is Measurement {
  return !!item && item.id != null && item.seriesId != null &&
    typeof item.value === 'number' && Number.isFinite(item.value) &&
    typeof item.timestamp === 'string' && Number.isFinite(Date.parse(item.timestamp));
}

/**
 * Porządkuje pomiary od najnowszych; remisy czasu rozstrzyga malejącym BIGINT ID.
 * Dla identyfikatorów innych niż liczby używa porównania napisów, bez utraty precyzji przez Number.
 */
function compareMeasurements(a: Measurement, b: Measurement): number {
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

/**
 * Sprawdza poprawność próbki, znane/widoczne serie i domknięte granice czasu.
 * @param now Czas odniesienia w milisekundach dla przesuwanych okien 24 h, 7 i 30 dni.
 */
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

/**
 * Łączy migawkę z dozwolonymi zdarzeniami, usuwa duplikaty po ID i ogranicza wynik po sortowaniu.
 * Zdarzenie później przetwarzane zastępuje rekord o tym samym ID; wejściowe tablice nie są modyfikowane.
 */
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

/**
 * Dodaje tylko pasujące, nieznane ID i ponownie stosuje porządek oraz limit.
 * Dla duplikatu lub próbki spoza filtra zwraca tę samą referencję tablicy.
 */
export function appendStreamMeasurement(
  previous: Measurement[], item: Measurement, filter: StreamFilter, now: number,
  limit = 1000,
): Measurement[] {
  if (!matchesStreamFilter(item, filter, now) ||
    previous.some( previousItem => String(previousItem.id) === String(item.id))) return previous;
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
 * Synchronizator migawki REST i zdarzeń SSE dla jednej generacji filtrów.
 * Nowa migawka jest rozstrzygająca; scala się z nią tylko zdarzenia odebrane od jej rozpoczęcia.
 */
export class TelemetryReconciler {
  /** Monotoniczny numer odróżniający odczyt rozpoczęty przed zmianą filtrów od aktualnego. */
  private generation = 0;
  /** Bufor zdarzeń odebranych podczas REST, podzielony na serie, z numerem właściciela odczytu. */
  private pending: { generation: number; events: Map<string, Measurement[]> } | null = null;
  private rows: Measurement[] = [];
  /** Filtr aktualnej generacji; jego lista serii zostaje uzupełniona przez autorytatywny REST. */
  private filter: StreamFilter = {
    range: 'all', availableSeriesIds: [], hiddenSeriesIds: [],
  };

  /**
   * Otwiera nową generację odczytu REST i bufor zdarzeń, filtrując dotychczasowe wiersze.
   * @returns Numer generacji wymagany przy finish().
   */
  begin(filter: StreamFilter, now = Date.now()): number {
    ++this.generation;
    this.filter = filter;
    this.pending = { generation: this.generation, events: new Map() };
    this.rows = reconcileMeasurements(this.rows, [], filter, now);
    return this.generation;
  }

  /**
   * Przyjmuje zdarzenie SSE i aktualizuje widoczne wiersze.
   * W trakcie REST buforuje do limitu osobno dla każdej serii, aby inne serie nie wyparły użytecznych próbek.
   */
  receive(item: Measurement, now = Date.now()): Measurement[] {
    if (!validMeasurement(item)) return this.rows;
    // The authoritative series list arrives with REST. Keep a separate bounded
    // buffer per series so unknown or excluded series cannot evict useful events.
    if (this.pending) {
      const id = String(item.seriesId);
      const filter = { ...this.filter, availableSeriesIds: [id] };
      const events = reconcileMeasurements(this.pending.events.get(id) ?? [], [item], filter, now);
      if (events.length) this.pending.events.set(id, events);
    }
    this.rows = reconcileMeasurements(this.rows, [item], this.filter, now);
    return this.rows;
  }

  /**
   * Stosuje autorytatywną migawkę REST wraz ze zdarzeniami odebranymi po begin().
   * @returns Nowe wiersze lub null dla nieaktualnej/unieważnionej generacji.
   */
  finish(generation: number, loaded: readonly Measurement[],
    filter: StreamFilter, now = Date.now()): Measurement[] | null {
    if (!this.pending || this.pending.generation !== generation) return null;
    this.filter = filter;
    this.rows = reconcileMeasurements(loaded, [...this.pending.events.values()].flat(), filter, now);
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
