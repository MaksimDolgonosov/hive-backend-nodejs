import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import env from '../config/env';

export const stingCreateRateLimit = rateLimit({
  windowMs: env.stingRateLimitWindowMs,
  max: env.stingRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  // requireAuth стоит перед этим middleware — ключ всегда по userId
  keyGenerator: (req: Request): string => req.user!.id,
  handler: (_req: Request, res: Response): void => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Слишком много публикаций, попробуйте позже',
      },
    });
  },
});
