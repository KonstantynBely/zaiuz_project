import type { Pool, PoolClient } from 'pg';

/** Zawsze kończy transakcję i zwalnia połączenie także przy wyjątku. */
export async function transaction<T>(pool: Pool, execute: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      const result = await execute(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
  }
}
