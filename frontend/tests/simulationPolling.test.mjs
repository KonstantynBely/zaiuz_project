import { strict as assert } from 'node:assert';
import test from 'node:test';
import { createSimulationPoller } from '../src/features/admin/simulationPolling.ts';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes,no)=>{resolve=yes;reject=no;});
  return { promise, resolve, reject };
};
const flush = () => new Promise(resolve => setImmediate(resolve));

test('poll cycles never overlap, and next timer starts after completion', async () => {
  const pending = deferred();
  let count=0;
  const seen=[];
  const poller=createSimulationPoller({
    load:async()=>{ count++; if(count===1)return pending.promise; return 'second'; },
    apply:result=>seen.push(result), fail:()=>{}, interval:100000,
  });
  const first=poller.poll();
  await poller.poll();
  assert.equal(count,1);
  pending.resolve('first');
  await first;
  assert.deepEqual(seen,['first']);
  poller.stop();
});

test('late response after mutation cannot overwrite newer state', async () => {
  const old=deferred();
  let requests=0;
  const states=[];
  const poller=createSimulationPoller({
    load:()=>++requests===1?old.promise:Promise.resolve('new'),
    apply:v=>states.push(v),fail:()=>{},interval:100000,
  });
  const first=poller.poll();
  poller.refresh();
  old.resolve('old');
  await first; await flush(); await flush();
  assert.deepEqual(states,['new']);
  assert.equal(requests,2);
  poller.stop();
});

test('unmount or session replacement ignores late data and 401 errors', async () => {
  const d=deferred();
  const states=[],errors=[];
  const poller=createSimulationPoller({
    load:()=>d.promise,apply:s=>states.push(s),fail:e=>errors.push(e),interval:100000,
  });
  const running=poller.poll();
  poller.stop();
  d.reject({status:401});
  await running;
  assert.deepEqual(states,[]);
  assert.deepEqual(errors,[]);
});
