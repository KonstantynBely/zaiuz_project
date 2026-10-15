import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTimestamp } from '../../backend/src/common/validation.js';
import { acceptsJson, ApiError } from '../../backend/src/common/errors.js';
import { parseMeasurementQuery } from '../../backend/src/modules/measurements/measurements.service.js';
import { createSeriesService } from '../../backend/src/modules/series/series.service.js';

test('Negocjacja odpowiedzi respektuje Accept i q=0', () => {
  assert.equal(acceptsJson(undefined),true);
  assert.equal(acceptsJson('application/json'),true);
  assert.equal(acceptsJson('application/xml, application/json;q=0.8'),true);
  assert.equal(acceptsJson('application/xml'),false);
  assert.equal(acceptsJson('application/json;q=0'),false);
});

test('Daty wymagają ISO 8601 z przesunięciem', () => {
  assert.equal(parseTimestamp('2026-10-15T18:00:00+02:00').toISOString(),'2026-10-15T16:00:00.000Z');
  assert.throws(()=>parseTimestamp('2026-10-15T18:00:00'),ApiError);
  assert.throws(()=>parseTimestamp('2026-13-15T18:00:00Z'),ApiError);
});

test('Walidacja filtrów pomiarów nie pozwala na wstrzyknięcia SQL',()=>{
  assert.deepEqual(parseMeasurementQuery({series:'1,3',limit:'10',sort:'-timestamp'}).series,['1','3']);
  assert.throws(()=>parseMeasurementQuery({series:'1);DROP TABLE series;--'}),ApiError);
  assert.throws(()=>parseMeasurementQuery({limit:'10001'}),ApiError);
  assert.throws(()=>parseMeasurementQuery({from:'2026-10-16T00:00:00Z',to:'2026-10-15T00:00:00Z'}),ApiError);
});

test('Serwis serii odrzuca niepoprawne zakresy przed wysłaniem SQL',async()=>{
  let inserts=0;
  const repo={insert:async()=>{inserts++;return {}},findAll:async()=>[],findById:async()=>null} as never;
  const service=createSeriesService(repo);
  await assert.rejects(()=>service.create({name:'Test',minValue:20,maxValue:20,color:'#112233'}),
    error=>error instanceof ApiError&&error.status===422);
  assert.equal(inserts,0);
});
