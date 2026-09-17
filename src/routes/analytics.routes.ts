import { Router } from 'express';
import * as analyticsController from '../controllers/analytics.controller';
import optionalAuth from '../middleware/optional-auth.middleware';
import { analyticsRateLimit } from '../middleware/rate-limit.middleware';
import handleValidation from '../middleware/validate.middleware';
import { analyticsValidator } from '../validators/growth.validators';

const router = Router();

router.post(
  '/events',
  optionalAuth,
  analyticsRateLimit,
  analyticsValidator,
  handleValidation,
  analyticsController.ingest,
);

export default router;
