import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createTestPool } from '../helpers/testDatabase.js';
import { createAuthRepository } from '../../backend/src/modules/auth/auth.repository.js';
import { createAuthService, hashPassword } from '../../backend/src/modules/auth/auth.service.js';

test('PostgreSQL: token sprawdzony przed zmianą hasła nie może zostać zapisany po zmianie', async () => {
  const pool = createTestPool();
  const repository = createAuthRepository(pool);
  let id: string | undefined;
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>( resolve => { release = resolve; });
  const ready = new Promise<void>( resolve => { reached = resolve; });
  const username = `auth_race_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  try {
    const oldHash = await hashPassword('old-concurrency-password');
    id = (await pool.query<{id:string}>(
      'INSERT INTO admins(username,password_hash) VALUES($1,$2) RETURNING id::text', [username, oldHash])).rows[0]!.id;
    const token = 'c'.repeat(64);
    assert.equal(await repository.storeToken(id, oldHash,
      createHash('sha256').update(token).digest('hex'), new Date(Date.now() + 60000)), true);
    const service = createAuthService({
      ...repository,
      storeToken: async (...args) => { reached(); await gate; return repository.storeToken(...args); },
    });
    const rejected = assert.rejects(service.login({ username, password:'old-concurrency-password' }), { status:401 });
    await ready;
    await service.changePassword(token, { currentPassword:'old-concurrency-password', newPassword:'new-concurrency-password' });
    release();
    await rejected;
    await assert.rejects(service.requireAdmin(token), { status:401 });
    const count = await pool.query<{n:number}>(
      'SELECT COUNT(*)::int AS n FROM access_tokens WHERE admin_id=$1 AND revoked_at IS NULL', [id]);
    assert.equal(count.rows[0]!.n, 0);
    assert.equal(await repository.storeToken(id, oldHash, 'd'.repeat(64), new Date(Date.now() + 60000)), false);
    const fresh = await createAuthService(repository).login({ username, password:'new-concurrency-password' });
    assert.equal((await service.requireAdmin(fresh.accessToken)).id, id);
  } finally {
    release();
    if (id) await pool.query('DELETE FROM admins WHERE id=$1', [id]);
    await pool.end();
  }
});
