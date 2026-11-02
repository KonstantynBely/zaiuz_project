import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword } from '../../backend/src/modules/auth/auth.service.js';
import { createTestPool } from '../helpers/testDatabase.js';
import { buildApp } from '../../backend/src/app.js';

/** Sprawdza scenariusz: SSE: nowy pomiar pojawia się w otwartym strumieniu. */
test('SSE: nowy pomiar pojawia się w otwartym strumieniu',async()=>{
  const pool=createTestPool();const app=buildApp({pool});
  const name=`sse_test_${Date.now()}_${Math.floor(Math.random()*1e9)}`;
  let adminId:string|null=null;let seriesId:string|null=null;
  const abort=new AbortController();
  try {
    adminId=(await pool.query<{id:string}>(
      'INSERT INTO admins(username,password_hash) VALUES($1,$2) RETURNING id::text',
      [name,await hashPassword('sse-test-password-2026')])).rows[0]!.id;
    const address=await app.listen({host:'127.0.0.1',port:0});
    const login=await app.inject({method:'POST',url:'/api/auth/login',payload:{username:name,password:'sse-test-password-2026'}});
    const auth={authorization:`Bearer ${login.json().accessToken}`};
    const s=await app.inject({method:'POST',url:'/api/series',headers:auth,
      payload:{name:'SSE test',minValue:0,maxValue:100,color:'#112233'}});
    seriesId=s.json().id;
    const sensor=await app.inject({method:'POST',url:'/api/sensors',headers:auth,
      payload:{name:'SSE sensor',seriesId}});
    const key=sensor.json().apiKey;
    const stream=await fetch(new URL('/api/events',address),{
      headers:{Accept:'text/event-stream'},signal:abort.signal,
    });
    assert.equal(stream.status,200);
    assert.match(stream.headers.get('content-type')??'',/text\/event-stream/);
    const reader=stream.body!.getReader();
    const first=await reader.read();
    assert.match(new TextDecoder().decode(first.value),/connected/);
    const write=await app.inject({method:'POST',url:'/api/measurements',headers:{'x-api-key':key},payload:{value:41}});
    assert.equal(write.statusCode,201);
    const incoming=await reader.read();
    const frame=new TextDecoder().decode(incoming.value);
    assert.match(frame,/event: measurement/);
    assert.equal(JSON.parse(frame.split('data: ')[1]!.split('\n')[0]!).value,41);
    abort.abort();await reader.cancel().catch(/** Obsługuje oczekiwaną odmowę kontrolowanej operacji asynchronicznej. */ ()=>{});
  } finally {
    abort.abort();
    await app.close();
    if(seriesId)await pool.query('DELETE FROM series WHERE id=$1',[seriesId]);
    if(adminId)await pool.query('DELETE FROM admins WHERE id=$1',[adminId]);
    await pool.end();
  }
});
