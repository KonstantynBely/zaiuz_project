import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMetarTemperatures } from '../../backend/src/modules/simulations/metar.source.js';

test('METAR: odrzucane są braki, błędne wartości, inne stacje i duplikaty czasu', () => {
  const timestamp = Math.floor(Date.now() / 1000) - 7200;
  const values = parseMetarTemperatures([
    { icaoId: 'EPWA', obsTime: timestamp + 3600, temp: 12.4 },
    { icaoId: 'EPWA', obsTime: timestamp, temp: -2.2 },
    { icaoId: 'EPKK', obsTime: timestamp + 60, temp: 6.0 },
    { icaoId: 'EPWA', obsTime: timestamp + 120, temp: null },
    { icaoId: 'EPWA', obsTime: timestamp + 240, temp: '18' },
    { icaoId: 'EPWA', obsTime: timestamp + 360, temp: Infinity },
    { icaoId: 'EPWA', obsTime: timestamp, temp: -2.2 },
  ], 'EPWA');
  assert.deepEqual(values, [
    { value: -2.2, timestamp: new Date(timestamp * 1000).toISOString() },
    { value: 12.4, timestamp: new Date((timestamp + 3600) * 1000).toISOString() },
  ]);
});
test('METAR: nie dopuszczamy uszkodzonej odpowiedzi', () => {
  assert.throws(() => parseMetarTemperatures(null, 'EPWA'), { status: 503 });
});
