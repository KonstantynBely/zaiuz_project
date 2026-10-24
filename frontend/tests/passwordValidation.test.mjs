import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordByteLength, passwordExceedsLimit } from '../src/features/admin/passwordValidation.ts';

test('72 bajty są dozwolone, a przekroczenie limitu jest odrzucane', () => {
  assert.equal(passwordExceedsLimit(''), false);
  assert.equal(passwordExceedsLimit('a'.repeat(72)), false);
  assert.equal(passwordExceedsLimit('a'.repeat(73)), true);
});

test('Limit uwzględnia bajty UTF-8 polskich znaków i emoji', () => {
  for (const [character, bytes] of [['ą', 2], ['😀', 4]]) {
    const boundary = character.repeat(72 / bytes);
    assert.equal(passwordByteLength(boundary), 72);
    assert.equal(passwordExceedsLimit(boundary), false);
    assert.equal(passwordExceedsLimit(boundary + 'a'), true);
    assert.equal(passwordExceedsLimit(boundary.slice(0, -character.length)), false);
  }
});
