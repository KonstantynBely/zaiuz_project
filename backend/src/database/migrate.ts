import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPool } from './pool.js';

/** Uruchamia wersjonowane pliki SQL w kolejności; pojedyncza migracja = transakcja. */
async function migrate(): Promise<void> {
  const pool = createPool();
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const directory = process.env.MIGRATIONS_DIR ?? resolve(process.cwd(), '../database/migrations');
    const files = (await readdir(directory)).filter(file => /^\d{3}_.+\.sql$/.test(file)).sort();
    if (files.length === 0) throw new Error(`Nie znaleziono migracji w ${directory}`);
    for (const file of files) {
      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock(742001)');
        const existing = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
        if (existing.rowCount === 0) {
          await client.query(await readFile(resolve(directory, file), 'utf8'));
          await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
          process.stdout.write(`Zastosowano migrację: ${file}\n`);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(error => {
  console.error('Błąd migracji:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
