import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword } from '../../backend/src/modules/auth/auth.service.js';
import { createPool } from '../../backend/src/database/pool.js';
import { buildApp } from '../../backend/src/app.js';
import { ApiError } from '../../backend/src/common/errors.js';

test('Symulacja przez REST tworzy dedykowany sensor, przesyła i zachowuje wyniki',async()=>{
  const pool=createPool();
  const observedTime = Date.now() - 3_600_000;
  const observedSamples = [
    { value: 4, timestamp: new Date(observedTime - 120_000).toISOString() },
    { value: 5, timestamp: new Date(observedTime - 60_000).toISOString() },
    { value: 6, timestamp: new Date(observedTime).toISOString() },
  ];
  let holdObserved=false;
  let waitingForObservations=0;
  let releaseObservations:()=>void=()=>{};
  const observationsGate=new Promise<void>(resolve=>{releaseObservations=resolve;});
  const app=buildApp({pool,loadObserved:async station=>{
    if(station==='EPKK')throw new ApiError(503,'Test: zewnętrzne źródło niedostępne');
    if(station==='EPGD') return [
      { value: -80, timestamp: observedSamples[0]!.timestamp },
      ...observedSamples,
    ];
    assert.equal(station,'EPWA');
    if(holdObserved) {
      waitingForObservations++;
      await observationsGate;
    }
    return observedSamples;
  }});
  const restCalls={register:0,revoke:0};
  app.addHook('onRequest',async request=>{
    const key=request.headers['x-roversense-worker-key'];
    if (typeof key !== 'string' || !/^[0-9a-f]{64}$/.test(key)) return;
    if (request.method==='POST' && request.url==='/api/sensors') restCalls.register++;
    if (request.method==='DELETE' && /^\/api\/sensors\/[1-9]\d*$/.test(request.url)) restCalls.revoke++;
  });
  const name=`simulation_test_${Date.now()}_${Math.floor(Math.random()*1e9)}`;
  let adminId:string|null=null;let seriesId:string|null=null;
  try {
    adminId=(await pool.query<{id:string}>(
      'INSERT INTO admins(username,password_hash) VALUES($1,$2) RETURNING id::text',
      [name,await hashPassword('the-simulator-test-password')])).rows[0]!.id;
    await app.listen({port:0,host:'127.0.0.1'});
    const login=await app.inject({method:'POST',url:'/api/auth/login',payload:{username:name,password:'the-simulator-test-password'}});
    assert.equal(login.statusCode,200);
    const auth={authorization:`Bearer ${login.json().accessToken}`};
    const series=await app.inject({method:'POST',url:'/api/series',headers:auth,
      payload:{name:'Seria w teście symulacji',minValue:-40,maxValue:80,color:'#112233',unit:'°C'}});
    assert.equal(series.statusCode,201);
    seriesId=series.json().id;
    const unauthorized=await app.inject({method:'POST',url:'/api/simulations',
      payload:{seriesId,mode:'history',pattern:'sine',count:3,intervalMs:200}});
    assert.equal(unauthorized.statusCode,401);
    // Sam nagłówek lokalnego workera nie daje uprawnień zewnętrznemu klientowi.
    const fakeWorker=await app.inject({method:'POST',url:'/api/sensors',
      headers:{'x-roversense-worker-key':'nieuprawniony-testowy-klucz'},
      payload:{name:'Odrzucony sensor',seriesId}});
    assert.equal(fakeWorker.statusCode,401,fakeWorker.body);
    const started=await app.inject({method:'POST',url:'/api/simulations',headers:auth,
      payload:{seriesId,mode:'history',pattern:'sine',count:3,intervalMs:200}});
    assert.equal(started.statusCode,202,started.body);
    const id=started.json().id;
    const sensorId=started.json().sensorId;
    assert.ok(sensorId);
    assert.ok(!started.body.includes('apiKey'));
    let completed:Record<string,unknown>|null=null;
    for(let i=0;i<40;i++){
      const result=await app.inject({method:'GET',url:`/api/simulations/${id}`,headers:auth});
      const row=result.json();
      if(row.state==='completed'||row.state==='failed'){completed=row;break;}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(completed?.state,'completed',JSON.stringify(completed));
    assert.equal(completed?.acceptedCount,3);
    assert.equal(completed?.rejectedCount,0);
    const points=await app.inject({method:'GET',url:`/api/measurements?series=${seriesId}`});
    assert.equal(points.statusCode,200);
    assert.equal(points.json().length,3);
    assert.ok(points.json().every((row:{sensorId:string})=>row.sensorId===sensorId));
    const sensors=await app.inject({method:'GET',url:'/api/sensors',headers:auth});
    assert.ok(!sensors.json().some((row:{id:string})=>row.id===sensorId));
    const stopped=await app.inject({method:'POST',url:`/api/simulations/${id}/stop`,headers:auth});
    assert.equal(stopped.statusCode,200);
    assert.equal(stopped.json().state,'completed');

    // Równoległe symulacje działają niezależnie; piąta ma otrzymać 409.
    const startLive=()=>app.inject({method:'POST',url:'/api/simulations',headers:auth,
      payload:{seriesId,mode:'live',pattern:'random',count:100,intervalMs:250}});
    const live=await startLive();
    assert.equal(live.statusCode,202,live.body);
    const other=await startLive();
    assert.equal(other.statusCode,202,other.body);
    const third=await startLive();
    assert.equal(third.statusCode,202,third.body);
    const fourth=await startLive();
    assert.equal(fourth.statusCode,202,fourth.body);
    const excess=await startLive();
    assert.equal(excess.statusCode,409,excess.body);
    const stop=await app.inject({method:'POST',url:`/api/simulations/${live.json().id}/stop`,headers:auth});
    assert.equal(stop.statusCode,200);
    assert.equal(stop.json().state,'stopped');
    assert.ok(!stop.body.includes('apiKey'));
    const stillRunning=await app.inject({method:'GET',url:`/api/simulations/${other.json().id}`,headers:auth});
    assert.equal(stillRunning.json().state,'running');
    for(const started of [other,third,fourth]){
      const stopped=await app.inject({method:'POST',url:`/api/simulations/${started.json().id}/stop`,headers:auth});
      assert.equal(stopped.json().state,'stopped');
    }

    // Obserwacje zachowują oryginalne wartości i znaczniki czasu w trybie historycznym.
    const observed=await app.inject({method:'POST',url:'/api/simulations',headers:auth,
      payload:{seriesId,mode:'history',pattern:'observed',station:'EPWA',intervalMs:200}});
    assert.equal(observed.statusCode,202,observed.body);
    assert.equal(observed.json().parameters.count,3);
    assert.equal(observed.json().parameters.source,'AWC METAR');
    let actual:Record<string,unknown>|null=null;
    for(let i=0;i<40;i++){
      const response=await app.inject({method:'GET',url:`/api/simulations/${observed.json().id}`,headers:auth});
      const state=response.json();
      if(state.state==='completed'||state.state==='failed'){actual=state;break;}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(actual?.state,'completed',JSON.stringify(actual));
    assert.equal(actual?.acceptedCount,3);
    const measurements=await app.inject({method:'GET',url:`/api/measurements?series=${seriesId}&limit=100`});
    const metar=measurements.json().filter((value:{sensorId:string})=>value.sensorId===observed.json().sensorId);
    assert.equal(metar.length,3);
    assert.deepEqual(metar.map((value:{value:number})=>value.value),[4,5,6]);
    assert.deepEqual(metar.map((value:{timestamp:string})=>value.timestamp),observedSamples.map(p=>p.timestamp));

    // METAR poza zakresem powinien zostać odrzucony PRZED utworzeniem sensora
    // i rekordu symulacji, a nie ukończyć zadanie z samymi odrzutami.
    const registeredBefore=restCalls.register;
    const runsBefore=(await app.inject({method:'GET',url:'/api/simulations',headers:auth})).json().length;
    const incompatible=await app.inject({method:'POST',url:'/api/simulations',headers:auth,
      payload:{seriesId,mode:'history',pattern:'observed',station:'EPGD',intervalMs:200}});
    assert.equal(incompatible.statusCode,422,incompatible.body);
    assert.match(incompatible.json().detail,/METAR.*zakres/u);
    assert.equal(restCalls.register,registeredBefore,'Nie wolno rejestrować czujnika dla niepoprawnej temperatury');
    assert.equal((await app.inject({method:'GET',url:'/api/simulations',headers:auth})).json().length,runsBefore);

    // Nieudana inicjalizacja nie może pozostawić zarezerwowanego miejsca.
    const unavailable=await app.inject({method:'POST',url:'/api/simulations',headers:auth,
      payload:{seriesId,mode:'live',pattern:'observed',station:'EPKK',intervalMs:60000}});
    assert.equal(unavailable.statusCode,503,unavailable.body);

    // Przytrzymanie czterech żądań na etapie pobierania źródła weryfikuje
    // rzeczywistą współbieżność inicjalizacji, a nie tylko już uruchomione zadania.
    holdObserved=true;
    const parallelRequests=Array.from({length:4},()=>app.inject({
      method:'POST',url:'/api/simulations',headers:auth,
      payload:{seriesId,mode:'live',pattern:'observed',station:'EPWA',intervalMs:60000},
    }));
    for(let i=0;i<100 && waitingForObservations<4;i++) {
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.equal(waitingForObservations,4,'Cztery inicjalizacje powinny równocześnie oczekiwać na dane');
    const fifthConcurrent=await app.inject({method:'POST',url:'/api/simulations',headers:auth,
      payload:{seriesId,mode:'live',pattern:'observed',station:'EPWA',intervalMs:60000}});
    assert.equal(fifthConcurrent.statusCode,409,fifthConcurrent.body);
    releaseObservations();
    const startedTogether=await Promise.all(parallelRequests);
    assert.deepEqual(startedTogether.map(response=>response.statusCode),[202,202,202,202],
      startedTogether.map(response=>response.body).join('\\n'));
    for(const response of startedTogether) {
      const stopped=await app.inject({method:'POST',
        url:`/api/simulations/${response.json().id}/stop`,headers:auth});
      assert.equal(stopped.statusCode,200,stopped.body);
      assert.equal(stopped.json().state,'stopped');
    }
    // Po zwolnieniu miejsc kolejna inicjalizacja musi znów być możliwa.
    const afterStop=await app.inject({method:'POST',url:'/api/simulations',headers:auth,
      payload:{seriesId,mode:'live',pattern:'observed',station:'EPWA',intervalMs:60000}});
    assert.equal(afterStop.statusCode,202,afterStop.body);
    const afterStopId=afterStop.json().id;
    const finished=await app.inject({method:'POST',url:`/api/simulations/${afterStopId}/stop`,headers:auth});
    assert.equal(finished.statusCode,200,finished.body);

    // Po wylogowaniu operatora worker nadal może wyrejestrować swój sensor.
    const postLogoutStart=await app.inject({method:'POST',url:'/api/simulations',headers:auth,
      payload:{seriesId,mode:'live',pattern:'sine',count:100,intervalMs:250}});
    assert.equal(postLogoutStart.statusCode,202,postLogoutStart.body);
    const logout=await app.inject({method:'POST',url:'/api/auth/logout',headers:auth});
    assert.equal(logout.statusCode,204);
    const relogin=await app.inject({method:'POST',url:'/api/auth/login',
      payload:{username:name,password:'the-simulator-test-password'}});
    assert.equal(relogin.statusCode,200);
    const freshAuth={authorization:`Bearer ${relogin.json().accessToken}`};
    const logoutStop=await app.inject({method:'POST',
      url:`/api/simulations/${postLogoutStart.json().id}/stop`,headers:freshAuth});
    assert.equal(logoutStop.statusCode,200,logoutStop.body);
    assert.equal(logoutStop.json().state,'stopped');
    const retired=await app.inject({method:'GET',url:'/api/sensors',headers:freshAuth});
    assert.ok(!retired.json().some((sensor:{id:string})=>sensor.id===postLogoutStart.json().sensorId));

    assert.ok(restCalls.register>=12,'Symulacje muszą rejestrować sensor przez HTTP REST');
    assert.equal(restCalls.revoke,restCalls.register,
      'Każdy sensor symulacji musi zostać wyrejestrowany przez HTTP REST');


  } finally {
    releaseObservations();
    await app.close();
    if(seriesId)await pool.query('DELETE FROM series WHERE id=$1',[seriesId]);
    if(adminId)await pool.query('DELETE FROM admins WHERE id=$1',[adminId]);
    await pool.end();
  }
});
