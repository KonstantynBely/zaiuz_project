import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulationsService } from '../../backend/src/modules/simulations/simulations.service.js';
import type { SimulationRow } from '../../backend/src/modules/simulations/simulations.repository.js';

const flush = () => new Promise<void>( resolve => setImmediate(resolve));

function fixture(failCreate = false) {
  const queue = new Map<string, boolean>();
  let row: SimulationRow | undefined;
  let failRevoke = true;
  let attempts = 0;
  const repo = {
    create: async (_series: string, sensor: string, parameters: SimulationRow['parameters']) => {
      if (failCreate) throw new Error('Run insert failed');
      row = { id:'1', series_id:'1', sensor_id:sensor, parameters, state:'pending',
        accepted_count:0, rejected_count:0, started_at:null, finished_at:null, error_summary:null };
      return row;
    },
    changeState: async (_id: string, state: SimulationRow['state'], error?: string) => {
      if (row) { row.state = state; row.error_summary = error ?? null; }
    },
    count: async () => {},
    get: async () => row,
    requestCleanup: async (sensor: string) => { if (queue.has(sensor)) queue.set(sensor, true); },
    pendingCleanup: async () => [...queue].filter( ([, ready]) => ready).map( ([id]) => id),
  };
  const sensorApi = {
    getSeries: async () => ({ minValue:0, maxValue:100 }),
    registerSensor: async () => { queue.set('1', false); return { id:'1', apiKey:'test-key' }; },
    revokeSensor: async (id: string) => {
      attempts++;
      if (failRevoke) throw new Error('Temporary REST failure');
      queue.delete(id);
    },
  };
  const app = { server:{ address:() => ({ port:3000 }) }, log:{ error:() => {} } };
  const service = createSimulationsService(app as never, repo as never, sensorApi);
  return { service, queue, recover:() => { failRevoke = false; }, attempts:() => attempts, row:() => row };
}

test('Błąd REST sprzątania pozostaje w kolejce i jest ponawiany po zakończeniu zadania', async t => {
  t.mock.timers.enable({ apis:['setTimeout'] });
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status:201 });
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

test('Stop przerywa oczekiwanie live i kończy zadanie po wyrejestrowaniu czujnika', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 201 }));
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
