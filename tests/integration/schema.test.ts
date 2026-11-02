import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestPool } from '../helpers/testDatabase.js';
import { buildApp } from '../../backend/src/app.js';

test('TimescaleDB: migracja tworzy hypertable measurements', async () => {
  const pool = createTestPool();
  try {
    const ext = await pool.query("SELECT extname FROM pg_extension WHERE extname = 'timescaledb'");
    assert.equal(ext.rows[0]?.extname, 'timescaledb');
    const table = await pool.query("SELECT hypertable_name FROM timescaledb_information.hypertables WHERE hypertable_name = 'measurements'");
    assert.equal(table.rows[0]?.hypertable_name, 'measurements');

    // Prawdziwy odczyt API przez tabelę relacyjną, bez produkcyjnych danych.
    const app = buildApp({ pool });
    try {
      const response = await app.inject({ method: 'GET', url: '/api/series' });
      assert.equal(response.statusCode, 200);
      assert.ok(Array.isArray(response.json()));
    } finally { await app.close(); }
  } finally { await pool.end(); }
});
