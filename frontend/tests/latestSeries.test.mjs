import { strict as assert } from 'node:assert';
import test from 'node:test';
import { fetchLatestForSeries } from '../src/api/client.ts';
import { loadLatestReadings } from '../src/features/dashboard/latestReadings.ts';

/** Sprawdza scenariusz: latest summary queries every series separately, including sparse series beyond global cap. */
test('latest summary queries every series separately, including sparse series beyond global cap', async () => {
  const original = globalThis.fetch;
  const requested = [];
  try {
    globalThis.fetch = /** Zastępuje zależność kontrolowanym wynikiem lub stanem fixture dla tego scenariusza. */ async path => {
      const url = new URL(String(path), 'http://localhost');
      assert.equal(url.pathname, '/api/measurements');
      assert.equal(url.searchParams.get('limit'), '1');
      assert.equal(url.searchParams.get('sort'), '-timestamp');
      const id = url.searchParams.get('series');
      requested.push(id);
      const result = id === 'rare' ? [{ id:'last-rare', seriesId:id, value:5, timestamp:'2020-01-01T00:00:00Z' }] : [];
      return { ok:true, status:200, /** Udostępnia przygotowane dane JSON bez pobierania ich z sieci. */ json:async()=>result };
    };
    const series=[...Array.from({length:7},/** Przekształca kontrolowane dane wejściowe w rekordy lub żądania badanego scenariusza. */ (_,i)=>({id:String(i+1)})),{id:'rare'}];
    const result=await fetchLatestForSeries(series);
    assert.equal(requested.length,8);
    assert.equal(result.length,8);
    assert.equal(result.find(/** Wybiera lub rozpoznaje rekord fixture spełniający warunek badanego scenariusza. */ row=>row.seriesId==='rare').measurement.id,'last-rare');
    assert.equal(result.find(/** Wybiera lub rozpoznaje rekord fixture spełniający warunek badanego scenariusza. */ row=>row.seriesId==='1').measurement,null);
  } finally {
    globalThis.fetch=original;
  }
});

/** Sprawdza scenariusz: a failed series does not discard successful results, including later batches. */
test('a failed series does not discard successful results, including later batches', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = /** Zastępuje zależność kontrolowanym wynikiem lub stanem fixture dla tego scenariusza. */ async path => {
      const id = new URL(String(path), 'http://localhost').searchParams.get('series');
      if (id === '2') return { ok: false, status: 503 };
      return { ok: true, /** Udostępnia przygotowane dane JSON bez pobierania ich z sieci. */ json: async () => id === '3' ? [] : [
        { id: 'latest-' + id, seriesId: id, value: 7, timestamp: '2026-10-24T11:00:00Z' },
      ] };
    };
    const results = await fetchLatestForSeries(Array.from({ length: 8 }, /** Przekształca kontrolowane dane wejściowe w rekordy lub żądania badanego scenariusza. */ (_, i) => ({ id: String(i + 1) })));
    assert.equal(results.length, 8);
    assert.match(results.find(/** Wybiera lub rozpoznaje rekord fixture spełniający warunek badanego scenariusza. */ row => row.seriesId === '2').error, /503/);
    assert.equal(results.find(/** Wybiera lub rozpoznaje rekord fixture spełniający warunek badanego scenariusza. */ row => row.seriesId === '3').measurement, null);
    assert.equal(results.find(/** Wybiera lub rozpoznaje rekord fixture spełniający warunek badanego scenariusza. */ row => row.seriesId === '8').measurement.id, 'latest-8');
  } finally {
    globalThis.fetch = original;
  }
});

/** Sprawdza scenariusz: cancellation stops subsequent batches instead of returning empty readings. */
test('cancellation stops subsequent batches instead of returning empty readings', async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  let requests = 0;
  try {
    globalThis.fetch = /** Zastępuje zależność kontrolowanym wynikiem lub stanem fixture dla tego scenariusza. */ async () => {
      requests++;
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    };
    await assert.rejects(fetchLatestForSeries(Array.from({ length: 8 }, /** Przekształca kontrolowane dane wejściowe w rekordy lub żądania badanego scenariusza. */ (_, id) => ({ id })), controller.signal), { name: 'AbortError' });
    assert.equal(requests, 6);
  } finally {
    globalThis.fetch = original;
  }
});

/** Sprawdza scenariusz: only failed series are retried and success replaces their error. */
test('only failed series are retried and success replaces their error', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = globalThis.fetch;
  const requested = [], results = [];
  let fail = true;
  let stop;
  try {
    globalThis.fetch = /** Zastępuje zależność kontrolowanym wynikiem lub stanem fixture dla tego scenariusza. */ async path => {
      const id = new URL(String(path), 'http://localhost').searchParams.get('series');
      requested.push(id);
      if (id === '2' && fail) return { ok: false, status: 503 };
      return { ok: true, /** Udostępnia przygotowane dane JSON bez pobierania ich z sieci. */ json: async () => [] };
    };
    stop = loadLatestReadings([{ id: '1' }, { id: '2' }], /** Wyznacza pomocniczy wynik używany przez asercje tego scenariusza testowego. */ batch => results.push(batch));
    await new Promise(/** Udostępnia sterowane zakończenie operacji asynchronicznej, potrzebne do odtworzenia wyścigu w teście. */ resolve => setImmediate(resolve));
    assert.match(results[0].find(/** Wybiera lub rozpoznaje rekord fixture spełniający warunek badanego scenariusza. */ row => row.seriesId === '2').error, /503/);
    fail = false;
    t.mock.timers.tick(5000);
    await new Promise(/** Udostępnia sterowane zakończenie operacji asynchronicznej, potrzebne do odtworzenia wyścigu w teście. */ resolve => setImmediate(resolve));
    assert.deepEqual(requested, ['1', '2', '2']);
    assert.deepEqual(results[1], [{ seriesId: '2', measurement: null }]);
    t.mock.timers.tick(10000);
    await new Promise(/** Udostępnia sterowane zakończenie operacji asynchronicznej, potrzebne do odtworzenia wyścigu w teście. */ resolve => setImmediate(resolve));
    assert.equal(requested.length, 3);
  } finally {
    stop?.();
    globalThis.fetch = original;
  }
});

/** Sprawdza scenariusz: disposing latest lookups cancels pending retries. */
test('disposing latest lookups cancels pending retries', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = globalThis.fetch;
  let requests = 0;
  let stop;
  try {
    globalThis.fetch = /** Zastępuje zależność kontrolowanym wynikiem lub stanem fixture dla tego scenariusza. */ async () => { requests++; return { ok: false, status: 503 }; };
    stop = loadLatestReadings([{ id: '1' }], /** Wyznacza pomocniczy wynik używany przez asercje tego scenariusza testowego. */ () => {});
    await new Promise(/** Udostępnia sterowane zakończenie operacji asynchronicznej, potrzebne do odtworzenia wyścigu w teście. */ resolve => setImmediate(resolve));
    stop();
    t.mock.timers.tick(10000);
    await new Promise(/** Udostępnia sterowane zakończenie operacji asynchronicznej, potrzebne do odtworzenia wyścigu w teście. */ resolve => setImmediate(resolve));
    assert.equal(requests, 1);
  } finally {
    stop?.();
    globalThis.fetch = original;
  }
});
