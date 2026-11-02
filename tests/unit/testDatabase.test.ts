import test from 'node:test';
import assert from 'node:assert/strict';
import { testDatabaseUrl } from '../helpers/testDatabase.js';

/** Sprawdza scenariusz: Konfiguracja testów nie korzysta z produkcyjnego DATABASE_URL. */
test('Konfiguracja testów nie korzysta z produkcyjnego DATABASE_URL', () => {
  assert.throws(/** Wykonuje niedozwolone wywołanie, którego synchroniczny wyjątek jest przedmiotem asercji. */ () => testDatabaseUrl({ DATABASE_URL: 'postgresql://localhost/roversense' }), /TEST_DATABASE_URL/);
  for (const url of ['postgresql://localhost/roversense', 'postgresql://remote.example/roversense_test',
    'https://localhost/roversense_test', 'postgresql://localhost/roversense_test_backup']) {
    assert.throws(/** Wykonuje niedozwolone wywołanie, którego synchroniczny wyjątek jest przedmiotem asercji. */ () => testDatabaseUrl({ TEST_DATABASE_URL: url }));
  }
  const url = 'postgresql://localhost/roversense_test';
  assert.equal(testDatabaseUrl({ TEST_DATABASE_URL: url }), url);
});
