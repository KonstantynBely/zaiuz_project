import test from 'node:test';
import assert from 'node:assert/strict';
import { isDatabaseId, parseId, parseTimestamp } from '../../backend/src/common/validation.js';
import { acceptsJson, ApiError } from '../../backend/src/common/errors.js';
import { parseMeasurementQuery } from '../../backend/src/modules/measurements/measurements.service.js';
import { createSeriesService } from '../../backend/src/modules/series/series.service.js';
import { createSensorsService } from '../../backend/src/modules/sensors/sensors.service.js';

test('Negocjacja odpowiedzi respektuje Accept i q=0', () => {
  assert.equal(acceptsJson(undefined),true);
  assert.equal(acceptsJson('application/json'),true);
  assert.equal(acceptsJson('application/xml, application/json;q=0.8'),true);
  assert.equal(acceptsJson('application/xml'),false);
  assert.equal(acceptsJson('application/json;q=0'),false);
});

test('Daty kalendarzowe i godziny nie są normalizowane do innego dnia', () => {
  for (const value of [
    '2026-02-30T10:00:00Z', '2026-02-29T10:00:00+02:00',
    '1900-02-29T10:00:00Z', '2026-04-31T10:00:00Z',
    '2026-01-01T24:00:00Z', '2026-01-01T12:60:00Z',
    '2026-01-01T12:00:60Z', '2026-01-01T12:00:00+24:00', '',
  ]) assert.throws( () => parseTimestamp(value), { status: 400 }, value);
  assert.equal(parseTimestamp('2000-02-29T10:00:00Z').toISOString(), '2000-02-29T10:00:00.000Z');
  assert.equal(parseTimestamp('2024-02-29T00:30:00.125+02:00').toISOString(), '2024-02-28T22:30:00.125Z');
});

test('Identyfikatory respektują zakres BIGINT bez utraty precyzji', () => {
  assert.equal(parseId('9223372036854775807'), '9223372036854775807');
  for (const value of ['9223372036854775808', '9'.repeat(100), '0', '-1', '1.5', '01']) {
    assert.equal(isDatabaseId(value), false);
    assert.throws( () => parseId(value), { status: 404 });
    assert.throws( () => parseMeasurementQuery({ series: value }), { status: 400 });
  }
});

test('Powtórzone parametry oraz pusta lista serii zwracają 400', () => {
  for (const name of ['series', 'from', 'to', 'sort', 'limit']) {
    assert.throws( () => parseMeasurementQuery({ [name]: ['1', '2'] } as never), { status: 400 });
  }
  assert.throws( () => parseMeasurementQuery({ series: '' }), { status: 400 });
});

test('Rejestracja czujnika odrzuca przepełnione lub niedokładne ID przed SQL', async () => {
  let inserts = 0;
  const service = createSensorsService({ register: async () => { inserts++; return null; } } as never);
  for (const seriesId of ['9223372036854775808', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(service.register({ name:'Test', seriesId }), { status:422 });
  }
  assert.equal(inserts, 0);
});

test('Daty wymagają ISO 8601 z przesunięciem', () => {
  assert.equal(parseTimestamp('2026-10-15T18:00:00+02:00').toISOString(),'2026-10-15T16:00:00.000Z');
  assert.throws( ()=>parseTimestamp('2026-10-15T18:00:00'),ApiError);
  assert.throws( ()=>parseTimestamp('2026-13-15T18:00:00Z'),ApiError);
});

test('Walidacja filtrów pomiarów nie pozwala na wstrzyknięcia SQL',()=>{
  assert.deepEqual(parseMeasurementQuery({series:'1,3',limit:'10',sort:'-timestamp'}).series,['1','3']);
  assert.throws( ()=>parseMeasurementQuery({series:'1);DROP TABLE series;--'}),ApiError);
  assert.throws( ()=>parseMeasurementQuery({limit:'10001'}),ApiError);
  assert.throws( ()=>parseMeasurementQuery({from:'2026-10-16T00:00:00Z',to:'2026-10-15T00:00:00Z'}),ApiError);
});

test('Serwis serii odrzuca niepoprawne zakresy przed wysłaniem SQL',async()=>{
  let inserts=0;
  const repo={ insert:async()=>{inserts++;return {}}, findAll:async()=>[], findById:async()=>null} as never;
  const service=createSeriesService(repo);
  await assert.rejects( ()=>service.create({name:'Test',minValue:20,maxValue:20,color:'#112233'}),
    error=>error instanceof ApiError&&error.status===422);
  assert.equal(inserts,0);
});
