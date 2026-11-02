import type { Measurement, Series } from '../../api/client';

/**
 * Tworzy trzy serie i próbki wyłącznie do podglądu Vite DEV, bez odczytu lub zapisu API.
 * Dane powstają dopiero w gałęzi DEV, dzięki czemu build produkcyjny usuwa fixture.
 */
export function createPreviewData() {
  const previewSeries: Series[] = [
    { id: 'demo-1', name: 'Temperatura modułu', minValue: -30, maxValue: 60, unit: '°C', color: '#e7a679' },
    { id: 'demo-2', name: 'Wilgotność względna', minValue: 0, maxValue: 100, unit: '%', color: '#78b8ac' },
    { id: 'demo-3', name: 'Napięcie akumulatora', minValue: 0, maxValue: 24, unit: 'V', color: '#d6c18f' },
  ];

  function createPreviewMeasurements(): Measurement[] {
    const start = Date.now() - 2 * 60 * 60 * 1000;
    const rows: Measurement[] = [];
    for (let i = 0; i < 24; i += 1) {
      const timestamp = new Date(start + i * 5 * 60_000).toISOString();
      const values = [
        12 + Math.sin(i / 3) * 7 + Math.cos(i / 2) * 2,
        48 + Math.sin(i / 4 + 2) * 15,
        16 + Math.cos(i / 5) * 1.8,
      ];
      previewSeries.forEach( (series, index) => rows.push({
        id: 'preview-' + index + '-' + i,
        seriesId: series.id,
        value: Number(values[index].toFixed(2)),
        timestamp,
      }));
    }
    return rows.reverse();
  }

  return { series: previewSeries, measurements: createPreviewMeasurements() };
}
