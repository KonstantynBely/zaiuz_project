import { strict as assert } from 'node:assert';
import test from 'node:test';
import { appendStreamMeasurement, matchesStreamFilter } from '../src/features/dashboard/measurementStream.ts';

const now = Date.parse('2026-10-22T12:00:00.000Z');
const from = '2026-09-01T00:00:00.000Z';
const to = '2026-09-30T23:59:59.999Z';
const history = { range: 'custom', from, to, hiddenSeriesIds: [], availableSeriesIds: ['1'] };
const point = (id, timestamp, seriesId='1') => ({ id, timestamp, seriesId, value: 7 });

test('SSE spoza wskazanego zakresu nie wypiera żadnego z 1000 historycznych pomiarów', () => {
  const original = Array.from({ length: 1000 }, (_, i) =>
    point(String(i + 1), new Date(Date.parse('2026-09-01T00:00:00Z') + i * 60_000).toISOString()));
  const outside = point('recent', '2026-10-22T11:59:00.000Z');
  const next = appendStreamMeasurement(original, outside, history, now);
  assert.strictEqual(next, original);
  assert.equal(next.length, 1000);
  assert.ok(next.some(row => row.id === '1'));
});

test('SSE sprzed i po wybranym terminie jest ignorowane', () => {
  const previous = [point('existing', '2026-09-15T00:00:00.000Z')];
  assert.strictEqual(appendStreamMeasurement(previous, point('before', '2026-08-31T23:59:59Z'), history, now), previous);
  assert.strictEqual(appendStreamMeasurement(previous, point('after', '2026-10-01T00:00:00Z'), history, now), previous);
});

test('SSE w przedziale jest przyjmowane, duplikat nie, a różne serie respektują filtr', () => {
  const first = point('1', '2026-09-01T00:00:00Z');
  const valid = point('2', '2026-09-30T23:59:59.999Z');
  const accepted = appendStreamMeasurement([first], valid, history, now);
  assert.deepEqual(accepted.map(row => row.id), ['2', '1']);
  assert.strictEqual(appendStreamMeasurement(accepted, valid, history, now), accepted);
  assert.strictEqual(appendStreamMeasurement(accepted, point('other', valid.timestamp, '2'), history, now), accepted);
  const hidden = { ...history, hiddenSeriesIds: ['1'] };
  assert.equal(matchesStreamFilter(valid, hidden, now), false);
});

test('SSE sprawdza okres względny i błędną datę zdarzenia', () => {
  const day = { range: '24h', hiddenSeriesIds: [], availableSeriesIds: ['1'] };
  assert.equal(matchesStreamFilter(point('recent', new Date(now - 60_000).toISOString()), day, now), true);
  assert.equal(matchesStreamFilter(point('old', new Date(now - 2 * 86_400_000).toISOString()), day, now), false);
  assert.equal(matchesStreamFilter(point('broken', 'invalid'), day, now), false);
  assert.equal(matchesStreamFilter(point('zero', new Date(now).toISOString()), {
    ...day, availableSeriesIds: [],
  }, now), false);
});
