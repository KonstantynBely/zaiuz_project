import { strict as assert } from 'node:assert';
import test from 'node:test';
import { TelemetryReconciler, reconcileMeasurements, preferLatest } from '../src/features/dashboard/measurementStream.ts';

const now = Date.parse('2026-10-24T12:00:00Z');
const point = (id, timestamp, seriesId='a') => ({ id, timestamp, seriesId, value: 12 });
const t = n => new Date(now + n).toISOString();
const all = { range:'all', hiddenSeriesIds:[], availableSeriesIds:['a','b'] };
const custom = { ...all, range:'custom', from:t(-3_600_000), to:t(-60_000) };

test('SSE received during REST fetch survives the snapshot, including initial series lookup', () => {
  const state = new TelemetryReconciler();
  const epoch = state.begin({ ...all, availableSeriesIds:[] }, now);
  state.receive(point('event',t(-1000)),now);
  assert.deepEqual(state.visible(now),[]);
  assert.deepEqual(state.finish(epoch,[point('rest',t(-2000))],all,now).map(x=>x.id),['event','rest']);
});

test('stale REST response after filter change is rejected, including SSE from prior filter', () => {
  const state = new TelemetryReconciler();
  const old = state.begin(all,now);
  state.receive(point('outside', t(-500)),now);
  const current = state.begin(custom,now);
  assert.equal(state.finish(old,[point('old',t(-500))],all,now),null);
  state.receive(point('inside',t(-100_000)),now);
  assert.deepEqual(state.finish(current,[point('history',t(-200_000))],custom,now).map(x=>x.id),['inside','history']);
});

test('reconnect REST snapshot is authoritative; no unconditional merge of older history', () => {
  const state = new TelemetryReconciler();
  state.finish(state.begin(all,now),[point('old',t(-10_000))],all,now);
  assert.deepEqual(state.finish(state.begin(all,now),[point('new',t(-1000))],all,now).map(x=>x.id),['new']);
});

test('measurements are deduplicated and newest first with limit 1000', () => {
  const rows = Array.from({ length: 1004 },(_,i)=>point(String(i+1),t(-i*1000)));
  const result = reconcileMeasurements(rows,[point('1',t(0))],all,now);
  assert.equal(result.length,1000);
  assert.equal(new Set(result.map(x=>x.id)).size,1000);
  assert.equal(result[0].id,'1');
  assert.ok(!result.some(x=>x.id==='1004'));
});

test('rolling 24h expires without arriving samples', () => {
  const state = new TelemetryReconciler();
  const f={ ...all, range:'24h' };
  state.finish(state.begin(f,now),[point('near',t(-86_390_000))],f,now);
  assert.equal(state.visible(now).length,1);
  assert.equal(state.visible(now+20_000).length,0);
});

test('latest measurement ignores hidden history filters and older late-arriving SSE', () => {
  const old=point('old',t(-10000),'b');
  const newer=point('new',t(-1000),'b');
  assert.equal(preferLatest(old,newer).id,'new');
  assert.equal(preferLatest(newer,old).id,'new');
  assert.equal(reconcileMeasurements([newer],[old],{ ...custom, hiddenSeriesIds:['b'] },now).length,0);
});

test('irrelevant SSE bursts cannot evict a buffered history measurement', () => {
  const state = new TelemetryReconciler();
  const filter = { ...custom, hiddenSeriesIds: ['b'] };
  const generation = state.begin(filter, now);
  const wanted = point('wanted', t(-100_000));
  state.receive(wanted, now);
  for (let i = 0; i < 1100; i++) {
    state.receive(point('outside-' + i, t(-i)), now);
    state.receive(point('hidden-' + i, t(-80_000), 'b'), now);
    state.receive(point('unknown-' + i, t(-80_000), 'removed'), now);
  }
  assert.deepEqual(state.finish(generation, [], filter, now), [wanted]);
});

test('first-load buffering survives a burst from a series absent from REST', () => {
  const state = new TelemetryReconciler();
  const generation = state.begin({ ...all, availableSeriesIds: [] }, now);
  const wanted = point('wanted', t(-100_000));
  state.receive(wanted, now);
  for (let i = 0; i < 1100; i++) {
    state.receive(point(String(i), t(-i), 'removed'), now);
  }
  assert.deepEqual(state.finish(generation, [], all, now), [wanted]);
});
