import { getConfig, requiredDatabaseUrl } from './config/env.js';
import { createPool } from './database/pool.js';
import { buildApp } from './app.js';
import { createSimulationsRepository } from './modules/simulations/simulations.repository.js';

async function main(): Promise<void> {
  const config = getConfig();
  const pool = createPool(requiredDatabaseUrl());
  const app = buildApp({ pool });
  try {
    // Uruchamianie bez migracji nie jest poprawnym stanem aplikacji.
    await pool.query('SELECT 1 FROM series LIMIT 1');
    await createSimulationsRepository(pool).recoverOrphans();
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error(error, 'Nie udało się uruchomić serwera');
    process.exitCode = 1;
    await app.close();
    await pool.end();
    return;
  }

  const shutdown = async () => {
    await app.close();
    await pool.end();
  };
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
}

void main();
