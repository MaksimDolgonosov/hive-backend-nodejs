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
import {
  adminCenterValidator,
  adminMediaReviewValidator,
  adminPlaceCreateValidator,
  adminReportResolveValidator,
  adminSuspendValidator,
  adminTransferValidator,
  placeIdValidator,
} from '../validators/places.validators';
import * as placesController from '../controllers/places.controller';

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
router.post(
  '/places',
  requireAuth,
  requireAdmin,
  adminPlaceCreateValidator,
  handleValidation,
  placesController.adminCreate,
);
router.post(
  '/places/:id/suspend',
  requireAuth,
  requireAdmin,
  adminSuspendValidator,
  handleValidation,
  placesController.adminSuspend,
);
router.post(
  '/places/:id/unsuspend',
  requireAuth,
  requireAdmin,
  placeIdValidator,
  handleValidation,
  placesController.adminUnsuspend,
);
router.post(
  '/places/:id/transfer',
  requireAuth,
  requireAdmin,
  adminTransferValidator,
  handleValidation,
  placesController.adminTransfer,
);
router.post(
  '/places/:id/center',
  requireAuth,
  requireAdmin,
  adminCenterValidator,
  handleValidation,
  placesController.adminMoveCenter,
);
router.post(
  '/place-media/:id/review',
  requireAuth,
  requireAdmin,
  adminMediaReviewValidator,
  handleValidation,
  placesController.adminReviewMedia,
);
router.post(
  '/place-reports/:id/resolve',
  requireAuth,
  requireAdmin,
  adminReportResolveValidator,
  handleValidation,
  placesController.adminResolveReport,
);

export default router;
