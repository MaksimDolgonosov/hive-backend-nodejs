import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import requireAdmin from '../middleware/admin.middleware';
import requireAuth from '../middleware/auth.middleware';
import handleValidation from '../middleware/validate.middleware';
import {
  accountTypeValidator,
  campaignCreateValidator,
  growthMetricsValidator,
  metricsQueryValidator,
} from '../validators/growth.validators';

const router = Router();

router.post(
  '/campaigns',
  requireAuth,
  requireAdmin,
  campaignCreateValidator,
  handleValidation,
  adminController.createCampaign,
);
router.post(
  '/users/:id/account-type',
  requireAuth,
  requireAdmin,
  accountTypeValidator,
  handleValidation,
  adminController.setAccountType,
);
router.get(
  '/metrics/density',
  requireAuth,
  requireAdmin,
  metricsQueryValidator,
  handleValidation,
  adminController.density,
);
router.get(
  '/metrics/retention',
  requireAuth,
  requireAdmin,
  metricsQueryValidator,
  handleValidation,
  adminController.retention,
);
router.get(
  '/metrics/growth',
  requireAuth,
  requireAdmin,
  growthMetricsValidator,
  handleValidation,
  adminController.growth,
);

export default router;
