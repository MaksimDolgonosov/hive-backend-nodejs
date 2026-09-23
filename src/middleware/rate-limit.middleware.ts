import { Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import env from '../config/env';

function tooManyRequestsHandler(code: string, message: string) {
  return (_req: Request, res: Response): void => {
    res.status(429).json({
      error: {
        code,
        message,
        details: { retryAfterSec: 60 },
      },
    });
  };
}

export const stingCreateRateLimit = rateLimit({
  windowMs: env.stingRateLimitWindowMs,
  max: env.stingRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request): boolean =>
    req.user?.accountType === 'partner' || req.user?.accountType === 'official',
  keyGenerator: (req: Request): string => req.user!.id,
  handler: tooManyRequestsHandler('RATE_LIMITED', 'Слишком много публикаций, попробуйте позже'),
});

export const inviteCreateRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => req.user!.id,
  handler: tooManyRequestsHandler('RATE_LIMITED', 'Слишком много приглашений, попробуйте позже'),
});

export const waitlistRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequestsHandler('RATE_LIMITED', 'Слишком много заявок, попробуйте позже'),
});

export const shareRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequestsHandler('RATE_LIMITED', 'Слишком много запросов, попробуйте позже'),
});

export const analyticsRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const deviceId =
      typeof req.body?.deviceId === 'string'
        ? req.body.deviceId
        : typeof req.headers['x-device-id'] === 'string'
          ? req.headers['x-device-id']
          : '';
    if (deviceId) {
      return `device:${deviceId}`;
    }
    return req.user?.id ?? (req.ip ? ipKeyGenerator(req.ip) : 'unknown');
  },
  handler: tooManyRequestsHandler('RATE_LIMITED', 'Слишком много событий, попробуйте позже'),
});

export const deviceRegisterRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => req.user!.id,
  handler: tooManyRequestsHandler('RATE_LIMITED', 'Слишком много устройств, попробуйте позже'),
});

export const authIpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequestsHandler('OTP_RATE_LIMITED', 'Слишком много запросов, попробуйте позже'),
});

function userDailyLimit(max: number, message: string) {
  return rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request): string => req.user!.id,
    handler: tooManyRequestsHandler('RATE_LIMITED', message),
  });
}

export const partnerApplicationCreateRateLimit = userDailyLimit(3, 'Слишком много заявок, попробуйте завтра');
export const partnerSubmitRateLimit = userDailyLimit(10, 'Слишком много отправок, попробуйте завтра');
export const partnerOnsiteRateLimit = userDailyLimit(10, 'Слишком много проверок на точке, попробуйте завтра');
export const placeMediaRateLimit = userDailyLimit(20, 'Слишком много фото места, попробуйте завтра');
export const placePauseRateLimit = userDailyLimit(10, 'Слишком много переключений видимости');
export const placeReportRateLimit = userDailyLimit(5, 'Слишком много жалоб, попробуйте завтра');

export const authEmailRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email) {
      return `email:${email}`;
    }
    return req.ip ? ipKeyGenerator(req.ip) : 'unknown';
  },
  handler: tooManyRequestsHandler('OTP_RATE_LIMITED', 'Слишком много запросов, попробуйте позже'),
});
