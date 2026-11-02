import { createPool } from '../../backend/src/database/pool.js';

/**
 * Wymaga osobnego TEST_DATABASE_URL do lokalnej bazy PostgreSQL z końcówką _test.
 * Nigdy nie wybiera automatycznie DATABASE_URL aplikacji i nie otwiera połączenia.
 * @throws Error przed utworzeniem puli dla brakującej lub niedozwolonej konfiguracji.
 */
export function testDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.TEST_DATABASE_URL;
  if (!value) throw new Error('Testy integracyjne wymagają osobnego TEST_DATABASE_URL');
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !local ||
      !/^[a-zA-Z0-9_]+_test$/.test(url.pathname.slice(1))) {
    throw new Error('TEST_DATABASE_URL musi wskazywać lokalną bazę PostgreSQL z nazwą kończącą się na _test');
  }
  return value;
}

/**
 * Tworzy pulę wyłącznie po sprawdzeniu konfiguracji odrębnej bazy testowej.
 * Wywołujący odpowiada za end(); funkcja nie stosuje migracji.
 */
export function createTestPool() {
  return createPool(testDatabaseUrl());
}
