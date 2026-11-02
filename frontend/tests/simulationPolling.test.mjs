import { strict as assert } from 'node:assert';
import test from 'node:test';
import { createSimulationPoller } from '../src/features/admin/simulationPolling.ts';

/** Tworzy sterowany Promise do odtwarzania wyścigu odpowiedzi w teście. */
const deferred = () => {
  let resolve, reject;
  const promise = new Promise(/** Udostępnia sterowane zakończenie operacji asynchronicznej, potrzebne do odtworzenia wyścigu w teście. */ (yes,no)=>{resolve=yes;reject=no;});
  return { promise, resolve, reject };
};
/** Oddaje sterowanie pętli zdarzeń, aby zakończyły się zaplanowane operacje asynchroniczne. */
const flush = () => new Promise(/** Udostępnia sterowane zakończenie operacji asynchronicznej, potrzebne do odtworzenia wyścigu w teście. */ resolve => setImmediate(resolve));

/** Sprawdza scenariusz: poll cycles never overlap, and next timer starts after completion. */
test('poll cycles never overlap, and next timer starts after completion', async () => {
  const pending = deferred();
  let count=0;
  const seen=[];
  const poller=createSimulationPoller({
    /** Udostępnia sterowany wynik odczytu, którego czas zakończenia kontroluje scenariusz pollera. */
    load:async()=>{ count++; if(count===1)return pending.promise; return 'second'; },
    /** Zachowuje zastosowany wynik pollera w stanie obserwowanym przez test. */
    apply:result=>seen.push(result), /** Rejestruje błąd pollera lub przyjmuje go bez efektu w scenariuszu zakończonym sukcesem. */ fail:()=>{}, interval:100000,
  });
  const first=poller.poll();
  await poller.poll();
  assert.equal(count,1);
  pending.resolve('first');
  await first;
  assert.deepEqual(seen,['first']);
  poller.stop();
});

/** Sprawdza scenariusz: late response after mutation cannot overwrite newer state. */
test('late response after mutation cannot overwrite newer state', async () => {
  const old=deferred();
  let requests=0;
  const states=[];
  const poller=createSimulationPoller({
    /** Udostępnia sterowany wynik odczytu, którego czas zakończenia kontroluje scenariusz pollera. */
    load:()=>++requests===1?old.promise:Promise.resolve('new'),
    /** Zachowuje zastosowany wynik pollera w stanie obserwowanym przez test. */
    apply:v=>states.push(v),/** Rejestruje błąd pollera lub przyjmuje go bez efektu w scenariuszu zakończonym sukcesem. */ fail:()=>{},interval:100000,
  });
  const first=poller.poll();
  poller.refresh();
  old.resolve('old');
  await first; await flush(); await flush();
  assert.deepEqual(states,['new']);
  assert.equal(requests,2);
  poller.stop();
});

/** Sprawdza scenariusz: unmount or session replacement ignores late data and 401 errors. */
test('unmount or session replacement ignores late data and 401 errors', async () => {
  const d=deferred();
  const states=[],errors=[];
  const poller=createSimulationPoller({
    /** Udostępnia sterowany wynik odczytu, którego czas zakończenia kontroluje scenariusz pollera. */
    load:()=>d.promise,/** Zachowuje zastosowany wynik pollera w stanie obserwowanym przez test. */ apply:s=>states.push(s),/** Rejestruje błąd pollera lub przyjmuje go bez efektu w scenariuszu zakończonym sukcesem. */ fail:e=>errors.push(e),interval:100000,
  });
  const running=poller.poll();
  poller.stop();
  d.reject({status:401});
  await running;
  assert.deepEqual(states,[]);
  assert.deepEqual(errors,[]);
});
