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
  // requireAuth стоит перед этим middleware — ключ всегда по userId
  keyGenerator: (req: Request): string => req.user!.id,
  handler: tooManyRequestsHandler('RATE_LIMITED', 'Слишком много публикаций, попробуйте позже'),
});

export const authIpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequestsHandler('OTP_RATE_LIMITED', 'Слишком много запросов, попробуйте позже'),
});

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
