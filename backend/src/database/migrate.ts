import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPool } from './pool.js';

/**
 * Stosuje nieuruchomione migracje SQL w kolejności nazw i ewidencjonuje je w schema_migrations.
 * Każdy plik ma osobną transakcję i blokadę advisory chroniącą przed równoległym zastosowaniem.
 * Katalog wskazuje MIGRATIONS_DIR lub ścieżka względem katalogu backendu.
 * @throws Błąd odczytu lub SQL; nieudaną migrację wycofuje, a połączenie i pulę zamyka.
 */
async function migrate(): Promise<void> {
  const pool = createPool();
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const directory = process.env.MIGRATIONS_DIR ?? resolve(process.cwd(), '../database/migrations');
    const files = (await readdir(directory)).filter(/** Wybiera tylko pliki SQL o wersjonowanej nazwie migracji. */ file => /^\d{3}_.+\.sql$/.test(file)).sort();
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

migrate().catch(/** Raportuje błąd skryptu bez sekretów i ustawia niezerowy kod zakończenia procesu. */ error => {
  console.error('Błąd migracji:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
