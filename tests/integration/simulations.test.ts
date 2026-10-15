import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword } from '../../backend/src/modules/auth/auth.service.js';
import { createPool } from '../../backend/src/database/pool.js';
import { buildApp } from '../../backend/src/app.js';

test('Symulacja przez REST tworzy dedykowany sensor, przesyła i zachowuje wyniki',async()=>{
  const pool=createPool();const app=buildApp({pool});
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
      payload:{name:'Seria w teście symulacji',minValue:-40,maxValue:80,color:'#112233'}});
    assert.equal(series.statusCode,201);
    seriesId=series.json().id;
    const unauthorized=await app.inject({method:'POST',url:'/api/simulations',
      payload:{seriesId,mode:'history',pattern:'sine',count:3,intervalMs:200}});
    assert.equal(unauthorized.statusCode,401);
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

    const live=await app.inject({method:'POST',url:'/api/simulations',headers:auth,
      payload:{seriesId,mode:'live',pattern:'random',count:100,intervalMs:250}});
    assert.equal(live.statusCode,202,live.body);
    const stop=await app.inject({method:'POST',url:`/api/simulations/${live.json().id}/stop`,headers:auth});
    assert.equal(stop.statusCode,200);
    assert.equal(stop.json().state,'stopped');
    assert.ok(!stop.body.includes('apiKey'));
  } finally {
    await app.close();
    if(seriesId)await pool.query('DELETE FROM series WHERE id=$1',[seriesId]);
    if(adminId)await pool.query('DELETE FROM admins WHERE id=$1',[adminId]);
    await pool.end();
  }
});
