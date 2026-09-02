import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateOtpAttempt,
  generateOtpCode,
  hashOtpCode,
  isOtpExpired,
  otpCodesEqual,
  remainingCooldownSec,
  remainingRateLimitSec,
  resolveLocale,
} from './otp';

const PEPPER = 'test-pepper';

test('generateOtpCode returns 6 digits from crypto-random range', () => {
  for (let i = 0; i < 50; i += 1) {
    const code = generateOtpCode();
    assert.match(code, /^\d{6}$/);
  }
});

test('hashOtpCode is deterministic and does not equal plaintext', () => {
  const hash = hashOtpCode('123456', PEPPER, 'user@example.com', 'register');
  const again = hashOtpCode('123456', PEPPER, 'user@example.com', 'register');

  assert.equal(hash, again);
  assert.notEqual(hash, '123456');
  assert.notEqual(
    hash,
    hashOtpCode('123456', PEPPER, 'other@example.com', 'register'),
  );
});

test('otpCodesEqual is true only for matching hashes', () => {
  const left = hashOtpCode('111111', PEPPER, 'a@b.c', 'register');
  const right = hashOtpCode('111111', PEPPER, 'a@b.c', 'register');
  const other = hashOtpCode('222222', PEPPER, 'a@b.c', 'register');

  assert.equal(otpCodesEqual(left, right), true);
  assert.equal(otpCodesEqual(left, other), false);
});

test('TTL: expired challenge is rejected', () => {
  const now = new Date('2026-09-02T12:00:00.000Z');
  assert.equal(isOtpExpired(new Date('2026-09-02T11:59:59.000Z'), now), true);
  assert.equal(isOtpExpired(new Date('2026-09-02T12:00:01.000Z'), now), false);

  const result = evaluateOtpAttempt({
    challenge: {
      consumedAt: null,
      expiresAt: new Date('2026-09-02T11:50:00.000Z'),
      attempts: 0,
      codeHash: hashOtpCode('123456', PEPPER, 'a@b.c', 'register'),
    },
    codeHash: hashOtpCode('123456', PEPPER, 'a@b.c', 'register'),
    maxAttempts: 5,
    now,
  });

  assert.deepEqual(result, { ok: false, code: 'OTP_EXPIRED' });
});

test('attempts: fifth invalid code yields OTP_MAX_ATTEMPTS', () => {
  const codeHash = hashOtpCode('123456', PEPPER, 'a@b.c', 'register');
  const result = evaluateOtpAttempt({
    challenge: {
      consumedAt: null,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      attempts: 4,
      codeHash,
    },
    codeHash: hashOtpCode('000000', PEPPER, 'a@b.c', 'register'),
    maxAttempts: 5,
  });

  assert.deepEqual(result, { ok: false, code: 'OTP_MAX_ATTEMPTS' });
});

test('attempts: valid code within limit succeeds', () => {
  const codeHash = hashOtpCode('123456', PEPPER, 'a@b.c', 'register');
  const result = evaluateOtpAttempt({
    challenge: {
      consumedAt: null,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      attempts: 3,
      codeHash,
    },
    codeHash,
    maxAttempts: 5,
  });

  assert.deepEqual(result, { ok: true });
});

test('cooldown: remaining seconds until resend is allowed', () => {
  const now = new Date('2026-09-02T12:00:00.000Z');
  const lastSentAt = new Date('2026-09-02T11:59:20.000Z');

  assert.equal(remainingCooldownSec(lastSentAt, 60, now), 20);
  assert.equal(remainingCooldownSec(lastSentAt, 60, new Date('2026-09-02T12:00:20.000Z')), 0);
});

test('rate limit window remaining seconds', () => {
  const now = new Date('2026-09-02T12:30:00.000Z');
  const oldest = new Date('2026-09-02T12:00:00.000Z');
  assert.equal(remainingRateLimitSec(oldest, now), 30 * 60);
});

test('resolveLocale prefers Accept-Language / query over default', () => {
  assert.equal(resolveLocale({ header: 'en-US,en;q=0.9', defaultLocale: 'ru' }), 'en');
  assert.equal(resolveLocale({ query: 'en', header: 'ru', defaultLocale: 'ru' }), 'en');
  assert.equal(resolveLocale({ header: 'de', defaultLocale: 'ru' }), 'ru');
});
