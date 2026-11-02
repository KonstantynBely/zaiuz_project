import test from 'node:test';
import assert from 'node:assert/strict';
import { testDatabaseUrl } from '../helpers/testDatabase.js';

test('Konfiguracja testów nie korzysta z produkcyjnego DATABASE_URL', () => {
  assert.throws( () => testDatabaseUrl({ DATABASE_URL: 'postgresql://localhost/roversense' }), /TEST_DATABASE_URL/);
  for (const url of ['postgresql://localhost/roversense', 'postgresql://remote.example/roversense_test',
    'https://localhost/roversense_test', 'postgresql://localhost/roversense_test_backup']) {
    assert.throws( () => testDatabaseUrl({ TEST_DATABASE_URL: url }));
  }
  const url = 'postgresql://localhost/roversense_test';
  assert.equal(testDatabaseUrl({ TEST_DATABASE_URL: url }), url);
});
