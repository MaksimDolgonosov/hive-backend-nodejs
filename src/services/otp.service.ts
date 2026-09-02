import env from '../config/env';
import EmailOtpChallenge, { OtpPurpose } from '../models/EmailOtpChallenge';
import { AppError } from '../utils/AppError';
import {
  EmailLocale,
  OTP_RATE_LIMIT_WINDOW_MS,
  evaluateOtpAttempt,
  generateOtpCode,
  hashOtpCode,
  remainingCooldownSec,
  remainingRateLimitSec,
} from '../utils/otp';
import { sendOtpEmail } from './email.service';

export interface OtpDispatchResult {
  status: 'otp_required' | 'otp_sent';
  email: string;
  purpose: OtpPurpose;
  expiresInSec: number;
  resendAvailableInSec: number;
}

function logOtpEvent(
  event: 'otp_sent' | 'otp_verified' | 'otp_failed' | 'email_send_failed',
  payload: Record<string, unknown>,
): void {
  console.log(JSON.stringify({ event, ...payload, ts: new Date().toISOString() }));
}

async function assertCanSend(
  email: string,
  purpose: OtpPurpose,
  now: Date,
  options?: { skipCooldown?: boolean },
): Promise<void> {
  if (!options?.skipCooldown) {
    const last = await EmailOtpChallenge.findOne({ email, purpose }).sort({ lastSentAt: -1 });
    if (last) {
      const retryAfterSec = remainingCooldownSec(last.lastSentAt, env.otpResendCooldownSec, now);
      if (retryAfterSec > 0) {
        throw new AppError(429, 'OTP_RESEND_COOLDOWN', 'Повторная отправка пока недоступна', {
          retryAfterSec,
        });
      }
    }
  }

  const windowStart = new Date(now.getTime() - OTP_RATE_LIMIT_WINDOW_MS);
  const recent = await EmailOtpChallenge.find({
    email,
    purpose,
    createdAt: { $gte: windowStart },
  })
    .sort({ createdAt: 1 })
    .select('createdAt')
    .lean();

  if (recent.length >= env.otpMaxResendPerHour) {
    throw new AppError(429, 'OTP_RATE_LIMITED', 'Превышен лимит отправки кода', {
      retryAfterSec: remainingRateLimitSec(recent[0].createdAt, now),
    });
  }
}

async function invalidateActiveChallenges(email: string, purpose: OtpPurpose, now: Date): Promise<void> {
  await EmailOtpChallenge.updateMany(
    { email, purpose, consumedAt: null },
    { $set: { consumedAt: now } },
  );
}

export async function issueOtpChallenge(input: {
  email: string;
  purpose: OtpPurpose;
  userId?: string | null;
  locale?: EmailLocale;
  sendEmail?: boolean;
  status?: OtpDispatchResult['status'];
  skipCooldown?: boolean;
}): Promise<OtpDispatchResult> {
  const now = new Date();
  await assertCanSend(input.email, input.purpose, now, { skipCooldown: input.skipCooldown });

  const code = generateOtpCode();
  const codeHash = hashOtpCode(code, env.otpPepper, input.email, input.purpose);
  const expiresAt = new Date(now.getTime() + env.otpTtlSec * 1000);

  await invalidateActiveChallenges(input.email, input.purpose, now);

  await EmailOtpChallenge.create({
    userId: input.userId ?? null,
    email: input.email,
    purpose: input.purpose,
    codeHash,
    expiresAt,
    attempts: 0,
    consumedAt: null,
    lastSentAt: now,
  });

  if (input.sendEmail !== false) {
    try {
      await sendOtpEmail({
        to: input.email,
        code,
        purpose: input.purpose,
        locale: input.locale,
      });
      logOtpEvent('otp_sent', { purpose: input.purpose, email: input.email });
    } catch (error) {
      logOtpEvent('email_send_failed', {
        purpose: input.purpose,
        email: input.email,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  return {
    status: input.status ?? 'otp_sent',
    email: input.email,
    purpose: input.purpose,
    expiresInSec: env.otpTtlSec,
    resendAvailableInSec: env.otpResendCooldownSec,
  };
}

export async function consumeValidOtp(input: {
  email: string;
  code: string;
  purpose: OtpPurpose;
}): Promise<{ userId: string | null }> {
  const now = new Date();
  const challenge = await EmailOtpChallenge.findOne({
    email: input.email,
    purpose: input.purpose,
    consumedAt: null,
  }).sort({ createdAt: -1 });

  const codeHash = hashOtpCode(input.code, env.otpPepper, input.email, input.purpose);
  const result = evaluateOtpAttempt({
    challenge,
    codeHash,
    maxAttempts: env.otpMaxAttempts,
    now,
  });

  if (!challenge) {
    logOtpEvent('otp_failed', { purpose: input.purpose, email: input.email, reason: 'OTP_NOT_FOUND' });
    throw new AppError(404, 'OTP_NOT_FOUND', 'Активный код не найден');
  }

  if (!result.ok) {
    if (result.code === 'OTP_INVALID' || result.code === 'OTP_MAX_ATTEMPTS') {
      challenge.attempts += 1;
      if (result.code === 'OTP_MAX_ATTEMPTS') {
        challenge.consumedAt = now;
      }
      await challenge.save();
    }

    if (result.code === 'OTP_EXPIRED') {
      challenge.consumedAt = now;
      await challenge.save();
    }

    logOtpEvent('otp_failed', { purpose: input.purpose, email: input.email, reason: result.code });

    const messages: Record<typeof result.code, string> = {
      OTP_NOT_FOUND: 'Активный код не найден',
      OTP_EXPIRED: 'Срок действия кода истёк',
      OTP_MAX_ATTEMPTS: 'Исчерпаны попытки ввода кода',
      OTP_INVALID: 'Неверный код',
    };
    const statusByCode: Record<typeof result.code, number> = {
      OTP_NOT_FOUND: 404,
      OTP_EXPIRED: 400,
      OTP_MAX_ATTEMPTS: 400,
      OTP_INVALID: 400,
    };

    throw new AppError(statusByCode[result.code], result.code, messages[result.code]);
  }

  challenge.consumedAt = now;
  await challenge.save();
  logOtpEvent('otp_verified', { purpose: input.purpose, email: input.email });

  return { userId: challenge.userId ? String(challenge.userId) : null };
}
