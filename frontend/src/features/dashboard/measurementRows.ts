import type { Measurement, Series } from '../../api/client';

/** Wiersz tabeli UI dla chwili i slotu; mapa cells przechowuje pomiary według ID serii. */
export interface MeasurementRow {
  key: string;
  timestamp: string;
  cells: Map<string, Measurement>;
}

/**
 * Grupuje widoczne pomiary według identycznego timestamp do tabeli z kolumną na serię.
 * Powtórzone pomiary tej samej serii i chwili trafiają do osobnych slotów bez utraty ID.
 * @returns Wiersze malejąco po czasie; komórki zawierają oryginalne pomiary.
 */
export function groupMeasurements(series: Series[], measurements: Measurement[]): MeasurementRow[] {
  const allowed = new Set(series.map(/** Wyodrębnia identyfikator do klucza porównania, filtra lub zbioru wyników. */ item => String(item.id)));
  const groups = new Map<string, Map<string, Measurement[]>>();

  for (const measurement of measurements) {
    const id = String(measurement.seriesId);
    if (!allowed.has(id)) continue;
    let bySeries = groups.get(measurement.timestamp);
    if (!bySeries) { bySeries = new Map(); groups.set(measurement.timestamp, bySeries); }
    const samples = bySeries.get(id) ?? [];
    samples.push(measurement);
    bySeries.set(id, samples);
  }

  const rows: MeasurementRow[] = [];
  for (const timestamp of [...groups.keys()].sort(/** Porządkuje chwile pomiarów od najnowszych do najstarszych. */ (a, b) => Date.parse(b) - Date.parse(a))) {
    const bySeries = groups.get(timestamp)!;
    const maxSlots = Math.max(...[...bySeries.values()].map(/** Wyznacza liczbę slotów potrzebną do zachowania powtórzonych pomiarów danej chwili. */ samples => samples.length));
    for (let index = 0; index < maxSlots; index += 1) {
      const cells = new Map<string, Measurement>();
      for (const [id, samples] of bySeries) {
        if (samples[index]) cells.set(id, samples[index]);
      }
      rows.push({ key: timestamp + ':' + index, timestamp, cells });
    }
  }
  return rows;
}
