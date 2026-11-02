import { strict as assert } from 'node:assert';
import test from 'node:test';
import { groupMeasurements } from '../src/features/dashboard/measurementRows.ts';

const series = [
  { id: '1', name: 'Temperatura', minValue: -40, maxValue: 40, color: '#e7a679' },
  { id: '2', name: 'Ciśnienie', minValue: 0, maxValue: 1200, color: '#78b8ac' },
];
const at = '2026-10-20T13:00:00.000Z';

test('wspólny czas zapisano w jednym wierszu z osobnymi kolumnami', () => {
  const rows = groupMeasurements(series, [
    { id: 'a', seriesId: '1', value: 4, timestamp: at },
    { id: 'b', seriesId: '2', value: 800, timestamp: at },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cells.get('1')?.id, 'a');
  assert.equal(rows[0].cells.get('2')?.id, 'b');
});

test('dwa pomiary tej samej serii i czasu zachowały osobne identyfikatory', () => {
  const rows = groupMeasurements(series, [
    { id: 'a', seriesId: '1', value: 4, timestamp: at },
    { id: 'b', seriesId: '1', value: 5, timestamp: at },
    { id: 'c', seriesId: '2', value: 900, timestamp: at },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].cells.get('1')?.id, 'a');
  assert.equal(rows[0].cells.get('2')?.id, 'c');
  assert.equal(rows[1].cells.get('1')?.id, 'b');
  assert.equal(rows[1].cells.get('2'), undefined);
});

test('pomiary są sortowane od najnowszego bez gubienia filtrów serii', () => {
  const rows = groupMeasurements(series.slice(0, 1), [
    { id: 'old', seriesId: '1', value: 1, timestamp: '2026-10-18T00:00:00.000Z' },
    { id: 'discard', seriesId: '2', value: 2, timestamp: '2026-10-22T00:00:00.000Z' },
    { id: 'new', seriesId: '1', value: 3, timestamp: '2026-10-21T00:00:00.000Z' },
  ]);
  assert.deepEqual(rows.map( row => row.cells.get('1')?.id), ['new', 'old']);
});

test('brak pomiarów zwraca pustą tabelę', () => {
  assert.deepEqual(groupMeasurements(series, []), []);
});
