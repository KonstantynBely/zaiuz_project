import { strict as assert } from 'node:assert';
import test from 'node:test';
import { createSimulationMonitor } from '../src/features/admin/simulationMonitor.ts';

/** Oddaje sterowanie pętli zdarzeń, aby zakończyły się zaplanowane operacje asynchroniczne. */
const flush = () => new Promise(/** Udostępnia sterowane zakończenie operacji asynchronicznej, potrzebne do odtworzenia wyścigu w teście. */ resolve => setImmediate(resolve));

/** Sprawdza scenariusz: series failures survive successful status polls and recover automatically. */
test('series failures survive successful status polls and recover automatically', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const failure = new Error('Series unavailable');
  const seriesErrors = [], runErrors = [], series = [], runs = [];
  let attempts = 0;
  const monitor = createSimulationMonitor({
    /** Udostępnia kontrolowaną listę serii albo jej błąd dla testu niezależnego monitora. */
    loadSeries: async () => {
      if (++attempts === 1) throw failure;
      return [{ id: '1' }];
    },
    /** Udostępnia kontrolowany wynik statusów, niezależny od pobierania serii. */
    loadRuns: async () => [{ id: 'run' }],
    /** Przyjmuje listę serii monitora i ewentualnie zachowuje ją do asercji. */
    onSeries: items => series.push(items),
    /** Przyjmuje wynik monitora uruchomień i ewentualnie zachowuje go do asercji. */
    onRuns: items => runs.push(items),
    /** Zachowuje błąd listy serii lub jego wyczyszczenie w stanie obserwowanym przez test. */
    onSeriesError: error => seriesErrors.push(error),
    /** Zachowuje błąd statusów lub jego wyczyszczenie niezależnie od stanu listy serii. */
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

/** Sprawdza scenariusz: run failure and recovery do not change series errors. */
test('run failure and recovery do not change series errors', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const seriesFailure = new Error('Series unavailable');
  const runFailure = new Error('Runs unavailable');
  const seriesErrors = [], runErrors = [];
  let attempts = 0;
  const monitor = createSimulationMonitor({
    /** Udostępnia kontrolowaną listę serii albo jej błąd dla testu niezależnego monitora. */
    loadSeries: async () => { throw seriesFailure; },
    /** Udostępnia kontrolowany wynik statusów, niezależny od pobierania serii. */
    loadRuns: async () => { if (++attempts === 1) throw runFailure; return []; },
    /** Przyjmuje listę serii monitora i ewentualnie zachowuje ją do asercji. */
    onSeries: () => {}, /** Przyjmuje wynik monitora uruchomień i ewentualnie zachowuje go do asercji. */ onRuns: () => {},
    /** Zachowuje błąd listy serii lub jego wyczyszczenie w stanie obserwowanym przez test. */
    onSeriesError: error => seriesErrors.push(error),
    /** Zachowuje błąd statusów lub jego wyczyszczenie niezależnie od stanu listy serii. */
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

/** Sprawdza scenariusz: disposing the monitor suppresses late series and status responses. */
test('disposing the monitor suppresses late series and status responses', async () => {
  let resolveSeries, rejectRuns;
  const seen = [];
  const monitor = createSimulationMonitor({
    /** Udostępnia kontrolowaną listę serii albo jej błąd dla testu niezależnego monitora. */
    loadSeries: () => new Promise(/** Udostępnia sterowane zakończenie operacji asynchronicznej, potrzebne do odtworzenia wyścigu w teście. */ resolve => { resolveSeries = resolve; }),
    /** Udostępnia kontrolowany wynik statusów, niezależny od pobierania serii. */
    loadRuns: () => new Promise(/** Udostępnia sterowane zakończenie operacji asynchronicznej, potrzebne do odtworzenia wyścigu w teście. */ (_, reject) => { rejectRuns = reject; }),
    /** Przyjmuje listę serii monitora i ewentualnie zachowuje ją do asercji. */
    onSeries: value => seen.push(value), /** Przyjmuje wynik monitora uruchomień i ewentualnie zachowuje go do asercji. */ onRuns: value => seen.push(value),
    /** Zachowuje błąd listy serii lub jego wyczyszczenie w stanie obserwowanym przez test. */
    onSeriesError: error => seen.push(error), /** Zachowuje błąd statusów lub jego wyczyszczenie niezależnie od stanu listy serii. */ onRunsError: error => seen.push(error),
  });
  monitor.stop();
  resolveSeries([{ id: 'old-session' }]);
  rejectRuns({ status: 401 });
  await flush();
  assert.deepEqual(seen, []);
});
