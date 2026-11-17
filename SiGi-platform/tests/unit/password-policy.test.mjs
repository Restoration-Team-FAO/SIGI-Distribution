import test from 'node:test';
import assert from 'node:assert/strict';

const { MINIMUM_PASSWORD_LENGTH, isStrongPassword } = await import(
  '../../apps/sigi-api/dist/modules/auth/password-policy.js'
);

test('new passwords require at least 12 characters', () => {
  assert.equal(MINIMUM_PASSWORD_LENGTH, 12);
  assert.equal(isStrongPassword('Short123!'), false);
  assert.equal(isStrongPassword('LongEnough123!'), true);
});

test('new passwords require letters and numbers', () => {
  assert.equal(isStrongPassword('OnlyLettersHere!'), false);
  assert.equal(isStrongPassword('123456789012!'), false);
  assert.equal(isStrongPassword('MixedPassword9!'), true);
});
