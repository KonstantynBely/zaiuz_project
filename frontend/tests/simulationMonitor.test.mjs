import { strict as assert } from 'node:assert';
import test from 'node:test';
import { createSimulationMonitor } from '../src/features/admin/simulationMonitor.ts';

const flush = () => new Promise( resolve => setImmediate(resolve));

test('series failures survive successful status polls and recover automatically', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const failure = new Error('Series unavailable');
  const seriesErrors = [], runErrors = [], series = [], runs = [];
  let attempts = 0;
  const monitor = createSimulationMonitor({
    loadSeries: async () => {
      if (++attempts === 1) throw failure;
      return [{ id: '1' }];
    },
    loadRuns: async () => [{ id: 'run' }],
    onSeries: items => series.push(items),
    onRuns: items => runs.push(items),
    onSeriesError: error => seriesErrors.push(error),
    onRunsError: error => runErrors.push(error),
  });
  try {
    await flush();
    assert.deepEqual(seriesErrors, [failure]);
    assert.deepEqual(runErrors, [null]);
    t.mock.timers.tick(2500);
    await flush();
    assert.equal(runs.length, 2);
    assert.deepEqual(seriesErrors, [failure]);
    assert.equal(series.length, 0);
    t.mock.timers.tick(2500);
    await flush();
    assert.deepEqual(series, [[{ id: '1' }]]);
    assert.deepEqual(seriesErrors, [failure, null]);
    t.mock.timers.tick(10000);
    await flush();
    assert.equal(attempts, 2, 'successful series lookup must not repeat');
  } finally {
    monitor.stop();
  }
});

test('run failure and recovery do not change series errors', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const seriesFailure = new Error('Series unavailable');
  const runFailure = new Error('Runs unavailable');
  const seriesErrors = [], runErrors = [];
  let attempts = 0;
  const monitor = createSimulationMonitor({
    loadSeries: async () => { throw seriesFailure; },
    loadRuns: async () => { if (++attempts === 1) throw runFailure; return []; },
    onSeries: () => {}, onRuns: () => {},
    onSeriesError: error => seriesErrors.push(error),
    onRunsError: error => runErrors.push(error),
  });
  try {
    await flush();
    t.mock.timers.tick(2500);
    await flush();
    assert.deepEqual(runErrors, [runFailure, null]);
    assert.deepEqual(seriesErrors, [seriesFailure]);
  } finally {
    monitor.stop();
  }
});

test('disposing the monitor suppresses late series and status responses', async () => {
  let resolveSeries, rejectRuns;
  const seen = [];
  const monitor = createSimulationMonitor({
    loadSeries: () => new Promise( resolve => { resolveSeries = resolve; }),
    loadRuns: () => new Promise( (_, reject) => { rejectRuns = reject; }),
    onSeries: value => seen.push(value), onRuns: value => seen.push(value),
    onSeriesError: error => seen.push(error), onRunsError: error => seen.push(error),
  });
  monitor.stop();
  resolveSeries([{ id: 'old-session' }]);
  rejectRuns({ status: 401 });
  await flush();
  assert.deepEqual(seen, []);
});
