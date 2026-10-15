import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword } from '../../backend/src/modules/auth/auth.service.js';
import { createPool } from '../../backend/src/database/pool.js';
import { buildApp } from '../../backend/src/app.js';

test('API: logowanie, serie, czujniki, pomiary i uprawnienia na TimescaleDB',async()=>{
  const pool=createPool();
  const app=buildApp({pool});
  const unique=`e2e_${Date.now()}_${Math.floor(Math.random()*1e9)}`;
  let adminId:string|null=null;
  let seriesId:string|null=null;
  try {
    const inserted=await pool.query<{id:string}>(
      'INSERT INTO admins(username,password_hash) VALUES($1,$2) RETURNING id::text',
      [unique,await hashPassword('secret-for-tests-2026')]);
    adminId=inserted.rows[0]!.id;
    const call=(method:'GET'|'POST'|'PUT'|'DELETE',url:string,token?:string,payload?:unknown)=>app.inject({
      method,url,headers:{...(token?{authorization:`Bearer ${token}`}:{})},
      ...(payload===undefined?{}:{payload}),
    });
    const unauthorized=await call('POST','/api/series',undefined,{name:'X',minValue:0,maxValue:10,color:'#001122'});
    assert.equal(unauthorized.statusCode,401);
    const login=await call('POST','/api/auth/login',undefined,{username:unique,password:'secret-for-tests-2026'});
    assert.equal(login.statusCode,200);
    const token=login.json().accessToken as string;
    assert.ok(token.length>=32);
    const invalid=await call('POST','/api/series',token,{name:'X',minValue:8,maxValue:3,color:'#112233'});
    assert.equal(invalid.statusCode,422);

    const create=await call('POST','/api/series',token,{name:'Czujnik temperatury',minValue:-40,maxValue:80,color:'#112233',unit:'°C',icon:'circle'});
    assert.equal(create.statusCode,201);
    assert.match(String(create.headers.location),/^\/api\/series\/\d+$/);
    seriesId=create.json().id;
    const initial=await call('GET',`/api/series/${seriesId}`);
    assert.equal(initial.json().unit,'°C');
    const wrongAccept=await app.inject({method:'GET',url:'/api/series',headers:{accept:'application/xml'}});
    assert.equal(wrongAccept.statusCode,406);
    const wrongMedia=await app.inject({method:'POST',url:'/api/series',headers:{authorization:`Bearer ${token}`,'content-type':'text/plain'},payload:'test'});
    assert.equal(wrongMedia.statusCode,415);

    const sensor=await call('POST','/api/sensors',token,{name:'Thermometer',seriesId});
    assert.equal(sensor.statusCode,201);
    const key=sensor.json().apiKey as string;
    assert.ok(key.length>=32);
    const sensorId=sensor.json().id;
    const sensors=await call('GET','/api/sensors',token);
    assert.equal(JSON.stringify(sensors.json()).includes(key),false);
    const noKey=await call('POST','/api/measurements',undefined,{value:12});
    assert.equal(noKey.statusCode,401);
    const post=(payload:unknown,k=key)=>app.inject({method:'POST',url:'/api/measurements',headers:{'x-api-key':k},payload});
    assert.equal((await post({value:-41})).statusCode,422);
    assert.equal((await post({value:20,timestamp:new Date(Date.now()+3600000).toISOString()})).statusCode,422);
    const boundaries=[];
    for(const value of [-40,80]) {
      const response=await post({value});
      assert.equal(response.statusCode,201,response.body);
      boundaries.push(response.json());
    }
    assert.ok(boundaries[0].id);
    assert.equal(boundaries[0].sensorId,sensorId);
    const lookup=await call('GET',String((await post({value:10})).headers.location));
    assert.equal(lookup.statusCode,200);
    const getMeasurements=await call('GET',`/api/measurements?series=${seriesId}&sort=-timestamp`);
    assert.equal(getMeasurements.statusCode,200);
    assert.equal(getMeasurements.json().length,3);
    const disallowed=await call('PUT',`/api/series/${seriesId}`,token,{name:'New',minValue:0,maxValue:50,color:'#112233'});
    assert.equal(disallowed.statusCode,409);
    const accepted=await call('PUT',`/api/series/${seriesId}`,token,{name:'New',minValue:-50,maxValue:90,color:'#223344'});
    assert.equal(accepted.statusCode,200);

    const rejected=await pool.query('SELECT COUNT(*)::int AS n FROM rejected_measurements WHERE sensor_id=$1',[sensorId]);
    assert.equal(rejected.rows[0].n,2);
    const revoke=await call('DELETE',`/api/sensors/${sensorId}`,token);
    assert.equal(revoke.statusCode,204);
    assert.equal((await post({value:12})).statusCode,401);
    assert.equal((await call('GET',`/api/measurements?series=${seriesId}`)).json().length,3);
    const logout=await call('POST','/api/auth/logout',token);
    assert.equal(logout.statusCode,204);
    assert.equal((await call('GET','/api/sensors',token)).statusCode,401);

    const relogin=await call('POST','/api/auth/login',undefined,{username:unique,password:'secret-for-tests-2026'});
    const newToken=relogin.json().accessToken;
    assert.equal((await call('DELETE',`/api/series/${seriesId}`,newToken)).statusCode,204);
    seriesId=null;
    assert.equal((await call('GET',`/api/measurements?series=${create.json().id}`)).json().length,0);
  } finally {
    if(seriesId)await pool.query('DELETE FROM series WHERE id=$1',[seriesId]);
    if(adminId)await pool.query('DELETE FROM admins WHERE id=$1',[adminId]);
    await app.close();await pool.end();
  }
});
