import { Pool } from 'pg';
import { requiredDatabaseUrl } from '../config/env.js';

/**
 * Konfiguruje pulę PostgreSQL z limitem pięciu połączeń i timeoutem zestawiania 3 s.
 * @param connectionString Adres PostgreSQL; domyślnie wymagany DATABASE_URL.
 * @returns Pula otwierająca połączenia na żądanie; właściciel musi wywołać end().
 */
export function createPool(connectionString = requiredDatabaseUrl()): Pool {
  return new Pool({ connectionString, max: 5, connectionTimeoutMillis: 3000 });
}
