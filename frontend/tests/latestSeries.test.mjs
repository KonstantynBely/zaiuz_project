import { strict as assert } from 'node:assert';
import test from 'node:test';
import { fetchLatestForSeries } from '../src/api/client.ts';

test('latest summary queries every series separately, including sparse series beyond global cap', async () => {
  const original = globalThis.fetch;
  const requested = [];
  try {
    globalThis.fetch = async path => {
      const url = new URL(String(path), 'http://localhost');
      assert.equal(url.pathname, '/api/measurements');
      assert.equal(url.searchParams.get('limit'), '1');
      assert.equal(url.searchParams.get('sort'), '-timestamp');
      const id = url.searchParams.get('series');
      requested.push(id);
      const result = id === 'rare' ? [{ id:'last-rare', seriesId:id, value:5, timestamp:'2020-01-01T00:00:00Z' }] : [];
      return { ok:true, status:200, json:async()=>result };
    };
    const series=[...Array.from({length:7},(_,i)=>({id:String(i+1)})),{id:'rare'}];
    const result=await fetchLatestForSeries(series);
    assert.equal(requested.length,8);
    assert.equal(result.length,8);
    assert.equal(result.find(row=>row.seriesId==='rare').measurement.id,'last-rare');
    assert.equal(result.find(row=>row.seriesId==='1').measurement,null);
  } finally {
    globalThis.fetch=original;
  }
});
