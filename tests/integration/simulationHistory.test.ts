import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestPool } from '../helpers/testDatabase.js';
import { createSimulationsRepository } from '../../backend/src/modules/simulations/simulations.repository.js';

/** Sprawdza scenariusz: Aktywne zadanie pozostaje widoczne po ponad 100 zakończonych symulacjach. */
test('Aktywne zadanie pozostaje widoczne po ponad 100 zakończonych symulacjach', async () => {
  const pool = createTestPool();
  const repo = createSimulationsRepository(pool);
  let seriesId: string | undefined;
  try {
    seriesId = (await pool.query<{ id: string }>(
      `INSERT INTO series(name,min_value,max_value,color)
       VALUES('Test historii symulacji',0,100,'#112233') RETURNING id::text`,
    )).rows[0]!.id;
    const runningId = (await pool.query<{ id: string }>(
      `INSERT INTO simulation_runs(series_id,state) VALUES($1,'running') RETURNING id::text`, [seriesId],
    )).rows[0]!.id;
    await pool.query(
      `INSERT INTO simulation_runs(series_id,state) SELECT $1,'completed' FROM generate_series(1,101)`, [seriesId],
    );
    assert.ok((await repo.list()).some(/** Wybiera lub rozpoznaje rekord fixture spełniający warunek badanego scenariusza. */ row => row.id === runningId));
    await repo.changeState(runningId, 'completed');
    await repo.changeState(runningId, 'stopping');
    assert.equal((await repo.get(runningId))?.state, 'completed', 'Stop nie może nadpisać zakończenia zadania');
  } finally {
    if (seriesId) await pool.query('DELETE FROM series WHERE id=$1', [seriesId]);
    await pool.end();
  }
});
