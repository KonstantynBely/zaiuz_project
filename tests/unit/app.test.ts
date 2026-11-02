import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../backend/src/app.js';
import { getConfig, requiredDatabaseUrl } from '../../backend/src/config/env.js';

/** Sprawdza scenariusz: GET /api/health zwraca wynik zgodny z OpenAPI. */
test('GET /api/health zwraca wynik zgodny z OpenAPI', async () => {
  const app = buildApp();
  try {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok' });
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
  } finally { await app.close(); }
});

/** Sprawdza scenariusz: GET /api/series mapuje wynik repozytorium na odpowiedź API. */
test('GET /api/series mapuje wynik repozytorium na odpowiedź API', async () => {
  const pool = {
    /** Zwraca kontrolowany wynik SQL lub rejestruje polecenie bez połączenia z bazą. */
    query: async () => ({ rows: [{ id: '1', name: 'Temperatura', min_value: -40, max_value: 80, color: '#B45309' }] }),
  };
  const app = buildApp({ pool: pool as never });
  try {
    const response = await app.inject({ method: 'GET', url: '/api/series' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), [
      { id: '1', name: 'Temperatura', minValue: -40, maxValue: 80, color: '#B45309' },
    ]);
  } finally { await app.close(); }
});

/** Sprawdza scenariusz: Walidacja JSON odrzuca błędne typy przed użyciem repozytorium. */
test('Walidacja JSON odrzuca błędne typy przed użyciem repozytorium', async () => {
  let queries = 0;
  const app = buildApp({ pool: { /** Zwraca kontrolowany wynik SQL lub rejestruje polecenie bez połączenia z bazą. */ query: async () => { queries++; return { rows: [] }; } } as never });
  try {
    const base = { name: 'Seria', minValue: 0, maxValue: 10, color: '#112233' };
    const requests = [
      ...[{ name: 123 }, { minValue: '0' }, { minValue: null }, { maxValue: true }]
        .map(/** Przekształca kontrolowane dane wejściowe w rekordy lub żądania badanego scenariusza. */ input => ({ url: '/api/series', payload: { ...base, ...input } })),
      ...[null, true, '12'].map(/** Przekształca kontrolowane dane wejściowe w rekordy lub żądania badanego scenariusza. */ value => ({ url: '/api/measurements', payload: { value } })),
      { url: '/api/auth/login', payload: { username: 123, password: 'password' } },
      { url: '/api/sensors', payload: { name: 123, seriesId: '1' } },
    ];
    for (const request of requests) {
      const response = await app.inject({ method: 'POST', ...request, headers: { 'x-api-key': 'a'.repeat(64) } });
      assert.equal(response.statusCode, 400, JSON.stringify(request));
      assert.equal(response.json().status, 400);
    }
    assert.equal(queries, 0);
  } finally { await app.close(); }
});

/** Sprawdza scenariusz: Nieistniejąca seria zwraca 404 Problem Details. */
test('Nieistniejąca seria zwraca 404 Problem Details', async () => {
  const app = buildApp({ pool: { /** Zwraca kontrolowany wynik SQL lub rejestruje polecenie bez połączenia z bazą. */ query: async () => ({ rows: [] }) } as never });
  try {
    const response = await app.inject({ method: 'GET', url: '/api/series/99999' });
    assert.equal(response.statusCode, 404);
    assert.equal(response.headers['content-type']?.includes('application/problem+json'), true);
    assert.equal(response.json().status, 404);
  } finally { await app.close(); }
});

/** Sprawdza scenariusz: DATABASE_URL musi być PostgreSQL. */
test('DATABASE_URL musi być PostgreSQL', () => {
  assert.throws(/** Wykonuje niedozwolone wywołanie, którego synchroniczny wyjątek jest przedmiotem asercji. */ () => requiredDatabaseUrl({}), /DATABASE_URL/);
  assert.throws(/** Wykonuje niedozwolone wywołanie, którego synchroniczny wyjątek jest przedmiotem asercji. */ () => requiredDatabaseUrl({ DATABASE_URL: 'file:app.db' }), /PostgreSQL/);
  assert.equal(getConfig({ PORT: '3001' }).port, 3001);
  assert.throws(/** Wykonuje niedozwolone wywołanie, którego synchroniczny wyjątek jest przedmiotem asercji. */ () => getConfig({ PORT: '99999' }), /PORT/);
});

/** Sprawdza scenariusz: Błędne publiczne identyfikatory i filtry zwracają 4xx przed zapytaniem SQL. */
test('Błędne publiczne identyfikatory i filtry zwracają 4xx przed zapytaniem SQL', async () => {
  let queries = 0;
  const app = buildApp({ pool: { /** Zwraca kontrolowany wynik SQL lub rejestruje polecenie bez połączenia z bazą. */ query: async () => { queries++; return { rows: [] }; } } as never });
  try {
    for (const [url, status] of [
      ['/api/series/9223372036854775808', 404],
      ['/api/measurements/9223372036854775808', 404],
      ['/api/measurements?series=9223372036854775808', 400],
      ['/api/measurements?series=1&series=2', 400],
      ['/api/measurements?from=2026-02-30T10:00:00Z', 400],
    ] as const) {
      const response = await app.inject({ method: 'GET', url });
      assert.equal(response.statusCode, status, response.body);
    }
    assert.equal(queries, 0);
  } finally { await app.close(); }
});
