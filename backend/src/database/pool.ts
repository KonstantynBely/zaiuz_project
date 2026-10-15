import { Pool } from 'pg';
import { requiredDatabaseUrl } from '../config/env.js';

/** Wspólna pula połączeń; bazę i schemat inicjalizuje osobna migracja. */
export function createPool(connectionString = requiredDatabaseUrl()): Pool {
  return new Pool({ connectionString, max: 5, connectionTimeoutMillis: 3000 });
}
