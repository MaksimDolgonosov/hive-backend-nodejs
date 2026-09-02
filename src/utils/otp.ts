import crypto from 'crypto';

import { OtpPurpose } from '../models/EmailOtpChallenge';

export type EmailLocale = 'ru' | 'en';

export const OTP_CODE_LENGTH = 6;
export const OTP_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export function generateOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(OTP_CODE_LENGTH, '0');
}

export function hashOtpCode(code: string, pepper: string, email: string, purpose: OtpPurpose): string {
  return crypto.createHmac('sha256', pepper).update(`${email}:${purpose}:${code}`).digest('hex');
}

export function otpCodesEqual(leftHash: string, rightHash: string): boolean {
  const left = Buffer.from(leftHash, 'hex');
  const right = Buffer.from(rightHash, 'hex');

  if (left.length === 0 || left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

export function isOtpExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function remainingCooldownSec(lastSentAt: Date, cooldownSec: number, now = new Date()): number {
  const elapsedMs = now.getTime() - lastSentAt.getTime();
  const remainingMs = cooldownSec * 1000 - elapsedMs;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

export function remainingRateLimitSec(oldestCreatedAt: Date, now = new Date()): number {
  const unlockAt = oldestCreatedAt.getTime() + OTP_RATE_LIMIT_WINDOW_MS;
  const remainingMs = unlockAt - now.getTime();
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

export type OtpCheckResult =
  | { ok: true }
  | { ok: false; code: 'OTP_NOT_FOUND' | 'OTP_EXPIRED' | 'OTP_MAX_ATTEMPTS' | 'OTP_INVALID' };

export function evaluateOtpAttempt(input: {
  challenge: {
    consumedAt: Date | null;
    expiresAt: Date;
    attempts: number;
    codeHash: string;
  } | null;
  codeHash: string;
  maxAttempts: number;
  now?: Date;
}): OtpCheckResult {
  const now = input.now ?? new Date();
  const { challenge } = input;

  if (!challenge || challenge.consumedAt) {
    return { ok: false, code: 'OTP_NOT_FOUND' };
  }

  if (isOtpExpired(challenge.expiresAt, now)) {
    return { ok: false, code: 'OTP_EXPIRED' };
  }

  if (challenge.attempts >= input.maxAttempts) {
    return { ok: false, code: 'OTP_MAX_ATTEMPTS' };
  }

  if (!otpCodesEqual(challenge.codeHash, input.codeHash)) {
    const nextAttempts = challenge.attempts + 1;
    if (nextAttempts >= input.maxAttempts) {
      return { ok: false, code: 'OTP_MAX_ATTEMPTS' };
    }
    return { ok: false, code: 'OTP_INVALID' };
  }

  return { ok: true };
}

export function resolveLocale(input?: {
  header?: string;
  query?: string;
  defaultLocale?: EmailLocale;
}): EmailLocale {
  const fallback = input?.defaultLocale ?? 'ru';
  const raw = (input?.query || input?.header || fallback).toLowerCase();
  const primary = raw.split(',')[0]?.trim().split(';')[0]?.trim() ?? fallback;

  if (primary.startsWith('en')) {
    return 'en';
  }
  if (primary.startsWith('ru')) {
    return 'ru';
  }
  return fallback;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
