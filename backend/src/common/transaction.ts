import type { Pool, PoolClient } from 'pg';

/**
 * Wykonuje callback na jednym połączeniu w transakcji PostgreSQL.
 * Zatwierdza wynik lub próbuje rollbacku; zawsze zwalnia klienta. Nieudany BEGIN lub rollback wycofuje połączenie z puli.
 * @param pool Pula, z której zostanie pobrane połączenie.
 * @param execute Operacja używająca przekazanego klienta; nie powinna samodzielnie kończyć transakcji.
 * @returns Wynik callbacku po udanym COMMIT.
 * @throws Pierwotny wyjątek; przy błędzie rollbacku AggregateError z obiema przyczynami.
 */
export async function transaction<T>(pool: Pool, execute: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let began = false;
  let discard = false;
  try {
    await client.query('BEGIN');
    began = true;
    const result = await execute(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (began) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        discard = true;
        throw new AggregateError([error, rollbackError], 'Transakcja i jej wycofanie nie powiodły się', { cause: error });
      }
    } else {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
