import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createAuthService, hashPassword } from '../../backend/src/modules/auth/auth.service.js';
import type { AuthRepository } from '../../backend/src/modules/auth/auth.repository.js';

const digest = (token: string) => createHash('sha256').update(token).digest('hex');

test('Hasła są ograniczone do 72 bajtów UTF-8, a nie 72 znaków', async () => {
  await assert.rejects(hashPassword('a'.repeat(73)), { status: 422 });
  await assert.rejects(hashPassword('ą'.repeat(37)), { status: 422 });
  assert.match(await hashPassword('ą'.repeat(36)), /^\$2/);
});

test('Logowanie nie akceptuje innej końcówki hasła poza limitem bcrypt', async () => {
  let lookups = 0;
  const service = createAuthService({
    findAdmin: async () => { lookups++; return null; },
  } as unknown as AuthRepository);
  await assert.rejects(service.login({ username: 'test', password: 'a'.repeat(72) + 'X' }), { status: 401 });
  assert.equal(lookups, 0);
});

test('Zmiana hasła odrzuca spóźnione logowanie starym hasłem i cofa sesje', async () => {
  let admin = { id: '1', username: 'test', password_hash: await hashPassword('old-password') };
  const oldToken = 'a'.repeat(64);
  const tokens = new Set([digest(oldToken)]);
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { reached = resolve; });
  const repository: AuthRepository = {
    findAdmin: async () => ({ ...admin }),
    findSession: async token => tokens.has(token) ? { ...admin } : null,
    storeToken: async (_id, expectedHash, token) => {
      reached();
      await gate;
      if (admin.password_hash !== expectedHash) return false;
      tokens.add(token);
      return true;
    },
    changePassword: async (_id, expected, next) => {
      if (admin.password_hash !== expected) return false;
      admin = { ...admin, password_hash: next };
      tokens.clear();
      return true;
    },
    revokeToken: async token => { tokens.delete(token); },
  };
  const service = createAuthService(repository);
  const rejected = assert.rejects(service.login({ username: 'test', password: 'old-password' }), { status: 401 });
  await ready;
  try {
    await service.changePassword(oldToken, { currentPassword: 'old-password', newPassword: 'new-password' });
  } finally { release(); }
  await rejected;
  assert.equal(tokens.size, 0);
});

test('Nieprawidłowe długie hasło bieżące i długie nowe hasło nie zmieniają konta', async () => {
  const prefix = 'a'.repeat(72);
  const admin = { id: '1', username: 'test', password_hash: await hashPassword(prefix) };
  let changes = 0;
  const service = createAuthService({
    findSession: async () => admin,
    changePassword: async () => { changes++; return true; },
  } as unknown as AuthRepository);
  const token = 'b'.repeat(64);
  await assert.rejects(service.changePassword(token, { currentPassword: prefix + 'X', newPassword: 'new-password' }), { status: 403 });
  await assert.rejects(service.changePassword(token, { currentPassword: prefix, newPassword: 'ą'.repeat(37) }), { status: 422 });
  assert.equal(changes, 0);
});
