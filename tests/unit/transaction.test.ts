import test from 'node:test';
import assert from 'node:assert/strict';
import { transaction } from '../../backend/src/common/transaction.js';

/** Buduje izolowaną atrapę zależności i uchwyty do obserwowania jej stanu. */
function fixture(failAt?: string) {
  const commands: string[] = [];
  let discarded: boolean | undefined;
  const client = {
    /** Zwraca kontrolowany wynik SQL lub rejestruje polecenie bez połączenia z bazą. */
    async query(command: string) {
      commands.push(command);
      if (command === failAt) throw new Error(command + ' failed');
    },
    /** Rejestruje sposób zwolnienia atrapy klienta, w tym żądanie odrzucenia połączenia. */
    release(discard: boolean) { discarded = discard; },
  };
  const pool = { /** Udostępnia atrapę klienta zamiast zestawiać połączenie PostgreSQL. */ connect: async () => client } as unknown as Parameters<typeof transaction>[0];
  return { pool, commands, /** Udostępnia zapamiętaną flagę odrzucenia atrapy połączenia do asercji. */ discarded: () => discarded };
}

/** Sprawdza scenariusz: Transakcja zatwierdza wynik i zwalnia połączenie. */
test('Transakcja zatwierdza wynik i zwalnia połączenie', async () => {
  const f = fixture();
  assert.equal(await transaction(f.pool, /** Zwraca kontrolowany wynik callbacku do weryfikacji zatwierdzenia transakcji. */ async () => 42), 42);
  assert.deepEqual(f.commands, ['BEGIN', 'COMMIT']);
  assert.equal(f.discarded(), false);
});

/** Sprawdza scenariusz: Transakcja wycofuje zapis i zachowuje pierwotny wyjątek. */
test('Transakcja wycofuje zapis i zachowuje pierwotny wyjątek', async () => {
  const f = fixture();
  const original = new Error('write failed');
  await assert.rejects(transaction(f.pool, /** Zgłasza pierwotny błąd zapisu, aby sprawdzić rollback i propagację przyczyny. */ async () => { throw original; }), /** Weryfikuje oczekiwany wyjątek lub uruchamia operację, która ma odrzucić Promise. */ error => error === original);
  assert.deepEqual(f.commands, ['BEGIN', 'ROLLBACK']);
  assert.equal(f.discarded(), false);
});

/** Sprawdza scenariusz: Nieudany rollback zachowuje oba błędy i usuwa połączenie z puli. */
test('Nieudany rollback zachowuje oba błędy i usuwa połączenie z puli', async () => {
  const f = fixture('ROLLBACK');
  const original = new Error('write failed');
  await assert.rejects(transaction(f.pool, /** Zgłasza pierwotny błąd zapisu, aby sprawdzić rollback i propagację przyczyny. */ async () => { throw original; }), /** Weryfikuje oczekiwany wyjątek lub uruchamia operację, która ma odrzucić Promise. */ error => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.cause, original);
    assert.equal(error.errors[0], original);
    assert.match(error.errors[1].message, /ROLLBACK/);
    return true;
  });
  assert.equal(f.discarded(), true);
});

/** Sprawdza scenariusz: Nieudany BEGIN odrzuca połączenie bez uruchomienia callbacku. */
test('Nieudany BEGIN odrzuca połączenie bez uruchomienia callbacku', async () => {
  const f = fixture('BEGIN');
  await assert.rejects(transaction(f.pool, /** Sygnalizuje błąd testu, jeśli helper uruchomi callback mimo nieudanego BEGIN. */ async () => assert.fail('callback')), /BEGIN failed/);
  assert.deepEqual(f.commands, ['BEGIN']);
  assert.equal(f.discarded(), true);
});

/** Sprawdza scenariusz: Nieudany COMMIT również wycofuje transakcję. */
test('Nieudany COMMIT również wycofuje transakcję', async () => {
  const f = fixture('COMMIT');
  await assert.rejects(transaction(f.pool, /** Zwraca kontrolowany wynik callbacku do weryfikacji zatwierdzenia transakcji. */ async () => 42), /COMMIT failed/);
  assert.deepEqual(f.commands, ['BEGIN', 'COMMIT', 'ROLLBACK']);
});
