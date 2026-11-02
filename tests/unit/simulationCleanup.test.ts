import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulationsService } from '../../backend/src/modules/simulations/simulations.service.js';
import type { SimulationRow } from '../../backend/src/modules/simulations/simulations.repository.js';

/** Oddaje sterowanie pętli zdarzeń, aby zakończyły się zaplanowane operacje asynchroniczne. */
const flush = () => new Promise<void>(/** Udostępnia sterowane zakończenie operacji asynchronicznej, potrzebne do odtworzenia wyścigu w teście. */ resolve => setImmediate(resolve));

/** Buduje izolowaną atrapę zależności i uchwyty do obserwowania jej stanu. */
function fixture(failCreate = false) {
  const queue = new Map<string, boolean>();
  let row: SimulationRow | undefined;
  let failRevoke = true;
  let attempts = 0;
  const repo = {
    /** Tworzy w pamięci rekord zadania albo zgłasza kontrolowany błąd zapisu uruchomienia. */
    create: async (_series: string, sensor: string, parameters: SimulationRow['parameters']) => {
      if (failCreate) throw new Error('Run insert failed');
      row = { id:'1', series_id:'1', sensor_id:sensor, parameters, state:'pending',
        accepted_count:0, rejected_count:0, started_at:null, finished_at:null, error_summary:null };
      return row;
    },
    /** Zapisuje stan i przyczynę błędu w bieżącym rekordzie fixture symulacji. */
    changeState: async (_id: string, state: SimulationRow['state'], error?: string) => {
      if (row) { row.state = state; row.error_summary = error ?? null; }
    },
    /** Przyjmuje wywołanie licznika; ten scenariusz sprawdza sprzątanie, a nie agregację pomiarów. */
    count: async () => {},
    /** Zwraca bieżący rekord fixture do sprawdzenia stanu zadania. */
    get: async () => row,
    /** Oznacza istniejący czujnik fixture jako gotowy do kolejnego sprzątania. */
    requestCleanup: async (sensor: string) => { if (queue.has(sensor)) queue.set(sensor, true); },
    /** Wybiera z pamięci fixture tylko czujniki oznaczone jako gotowe do wyrejestrowania. */
    pendingCleanup: async () => [...queue].filter(/** Wybiera lub rozpoznaje rekord fixture spełniający warunek badanego scenariusza. */ ([, ready]) => ready).map(/** Przekształca kontrolowane dane wejściowe w rekordy lub żądania badanego scenariusza. */ ([id]) => id),
  };
  const sensorApi = {
    /** Udostępnia stały zakres serii potrzebny do uruchomienia testowego zadania. */
    getSeries: async () => ({ minValue:0, maxValue:100 }),
    /** Dodaje wpis kolejki fixture i zwraca testowy klucz, bez wysyłania REST. */
    registerSensor: async () => { queue.set('1', false); return { id:'1', apiKey:'test-key' }; },
    /** Zlicza próby i symuluje awarię wyrejestrowania lub usuwa czujnik z kolejki fixture. */
    revokeSensor: async (id: string) => {
      attempts++;
      if (failRevoke) throw new Error('Temporary REST failure');
      queue.delete(id);
    },
  };
  const app = { server:{ /** Zwraca testowy port dla workera; samo wywołanie nie otwiera serwera HTTP. */ address:() => ({ port:3000 }) }, log:{ /** Przyjmuje testowy wpis błędu bez wypisywania kontrolowanych awarii do logów. */ error:() => {} } };
  const service = createSimulationsService(app as never, repo as never, sensorApi);
  return { service, queue, /** Przełącza atrapę wyrejestrowania z awarii na udaną odpowiedź dla następnej próby. */ recover:() => { failRevoke = false; }, /** Udostępnia liczbę prób wyrejestrowania czujnika, obserwowaną przez asercje. */ attempts:() => attempts, /** Udostępnia aktualny rekord zadania lub undefined przed jego utworzeniem. */ row:() => row };
}

/** Sprawdza scenariusz: Błąd REST sprzątania pozostaje w kolejce i jest ponawiany po zakończeniu zadania. */
test('Błąd REST sprzątania pozostaje w kolejce i jest ponawiany po zakończeniu zadania', async t => {
  t.mock.timers.enable({ apis:['setTimeout'] });
  const original = globalThis.fetch;
  globalThis.fetch = /** Zastępuje zależność kontrolowanym wynikiem lub stanem fixture dla tego scenariusza. */ async () => new Response('', { status:201 });
  const f = fixture();
  try {
    await f.service.start({ seriesId:'1', mode:'history', pattern:'random', count:1 });
    await flush();
    assert.equal(f.row()?.state, 'failed');
    assert.equal(f.queue.get('1'), true);
    f.recover();
    t.mock.timers.tick(5000);
    await flush();
    assert.equal(f.queue.size, 0);
    assert.equal(f.attempts(), 2);
    await f.service.close();
    t.mock.timers.tick(10000);
    await flush();
    assert.equal(f.attempts(), 2);
  } finally {
    await f.service.close();
    globalThis.fetch = original;
  }
});

/** Sprawdza scenariusz: Nieudany zapis symulacji nie gubi wcześniej zarejestrowanego czujnika. */
test('Nieudany zapis symulacji nie gubi wcześniej zarejestrowanego czujnika', async t => {
  t.mock.timers.enable({ apis:['setTimeout'] });
  const f = fixture(true);
  try {
    await assert.rejects(f.service.start({ seriesId:'1', mode:'history', pattern:'random', count:1 }), /Run insert failed/);
    assert.equal(f.row(), undefined);
    assert.equal(f.queue.get('1'), true);
    f.recover();
    t.mock.timers.tick(5000);
    await flush();
    assert.equal(f.queue.size, 0);
  } finally { await f.service.close(); }
});

/** Sprawdza scenariusz: Stop przerywa oczekiwanie live i kończy zadanie po wyrejestrowaniu czujnika. */
test('Stop przerywa oczekiwanie live i kończy zadanie po wyrejestrowaniu czujnika', async t => {
  t.mock.method(globalThis, 'fetch', /** Zastępuje zależność kontrolowanym wynikiem lub stanem fixture dla tego scenariusza. */ async () => new Response('', { status: 201 }));
  const f = fixture();
  f.recover();
  try {
    const run = await f.service.start({ seriesId: '1', mode: 'live', pattern: 'random', count: 2, intervalMs: 60_000 });
    await flush();
    assert.equal(f.row()?.state, 'running');
    const stopped = await f.service.stop(run.id);
    assert.equal(stopped.state, 'stopped');
    assert.equal(f.queue.size, 0);
  } finally { await f.service.close(); }
});
