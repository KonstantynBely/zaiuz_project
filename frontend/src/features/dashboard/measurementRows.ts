import type { Measurement, Series } from '../../api/client';

export interface MeasurementRow {
  key: string;
  timestamp: string;
  cells: Map<string, Measurement>;
}

/**
 * Pomiary o wspólnym timestamp trafiają do jednego wiersza; wielokrotne
 * pomiary z tej samej serii i chwili otrzymują osobny wiersz (slot).
 * Identyfikator pomiaru pozostaje jedynym kluczem zaznaczenia punktu.
 */
export function groupMeasurements(series: Series[], measurements: Measurement[]): MeasurementRow[] {
  const allowed = new Set(series.map(item => String(item.id)));
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
  for (const timestamp of [...groups.keys()].sort((a, b) => Date.parse(b) - Date.parse(a))) {
    const bySeries = groups.get(timestamp)!;
    const maxSlots = Math.max(...[...bySeries.values()].map(samples => samples.length));
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
