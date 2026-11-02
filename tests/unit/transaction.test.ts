import test from 'node:test';
import assert from 'node:assert/strict';
import { transaction } from '../../backend/src/common/transaction.js';

function fixture(failAt?: string) {
  const commands: string[] = [];
  let discarded: boolean | undefined;
  const client = {
    async query(command: string) {
      commands.push(command);
      if (command === failAt) throw new Error(command + ' failed');
    },
    release(discard: boolean) { discarded = discard; },
  };
  const pool = { connect: async () => client } as unknown as Parameters<typeof transaction>[0];
  return { pool, commands, discarded: () => discarded };
}

test('Transakcja zatwierdza wynik i zwalnia połączenie', async () => {
  const f = fixture();
  assert.equal(await transaction(f.pool, async () => 42), 42);
  assert.deepEqual(f.commands, ['BEGIN', 'COMMIT']);
  assert.equal(f.discarded(), false);
});

test('Transakcja wycofuje zapis i zachowuje pierwotny wyjątek', async () => {
  const f = fixture();
  const original = new Error('write failed');
  await assert.rejects(transaction(f.pool, async () => { throw original; }), error => error === original);
  assert.deepEqual(f.commands, ['BEGIN', 'ROLLBACK']);
  assert.equal(f.discarded(), false);
});

test('Nieudany rollback zachowuje oba błędy i usuwa połączenie z puli', async () => {
  const f = fixture('ROLLBACK');
  const original = new Error('write failed');
  await assert.rejects(transaction(f.pool, async () => { throw original; }), error => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.cause, original);
    assert.equal(error.errors[0], original);
    assert.match(error.errors[1].message, /ROLLBACK/);
    return true;
  });
  assert.equal(f.discarded(), true);
});

test('Nieudany BEGIN odrzuca połączenie bez uruchomienia callbacku', async () => {
  const f = fixture('BEGIN');
  await assert.rejects(transaction(f.pool, async () => assert.fail('callback')), /BEGIN failed/);
  assert.deepEqual(f.commands, ['BEGIN']);
  assert.equal(f.discarded(), true);
});

test('Nieudany COMMIT również wycofuje transakcję', async () => {
  const f = fixture('COMMIT');
  await assert.rejects(transaction(f.pool, async () => 42), /COMMIT failed/);
  assert.deepEqual(f.commands, ['BEGIN', 'COMMIT', 'ROLLBACK']);
});
