import { Router } from 'express';

import * as placesController from '../controllers/places.controller';
import requireAuth from '../middleware/auth.middleware';
import { placeMediaRateLimit, placePauseRateLimit, placeReportRateLimit } from '../middleware/rate-limit.middleware';
import { handlePlacePhotoUpload } from '../middleware/upload.middleware';
import handleValidation from '../middleware/validate.middleware';
import {
  galleryOrderValidator,
  mediaIdValidator,
  placeIdValidator,
  placeMediaValidator,
  placeReportValidator,
  placeStingsValidator,
  updatePlaceValidator,
} from '../validators/places.validators';

const router = Router();

router.get('/me', requireAuth, placesController.mine);
router.get('/:id', requireAuth, placeIdValidator, handleValidation, placesController.getById);
router.get('/:id/stings', requireAuth, placeStingsValidator, handleValidation, placesController.stings);
router.patch('/:id', requireAuth, updatePlaceValidator, handleValidation, placesController.update);
router.post(
  '/:id/pause',
  requireAuth,
  placePauseRateLimit,
  placeIdValidator,
  handleValidation,
  placesController.pause,
);
router.post(
  '/:id/resume',
  requireAuth,
  placePauseRateLimit,
  placeIdValidator,
  handleValidation,
  placesController.resume,
);
router.delete(
  '/:id',
  requireAuth,
  placePauseRateLimit,
  placeIdValidator,
  handleValidation,
  placesController.removeDraft,
);
router.post(
  '/:id/media',
  requireAuth,
  placeMediaRateLimit,
  handlePlacePhotoUpload,
  placeMediaValidator,
  handleValidation,
  placesController.addMedia,
);
router.patch(
  '/:id/media/order',
  requireAuth,
  galleryOrderValidator,
  handleValidation,
  placesController.reorderMedia,
);
router.delete(
  '/:id/media/:mediaId',
  requireAuth,
  mediaIdValidator,
  handleValidation,
  placesController.removeMedia,
);
router.post(
  '/:id/reports',
  requireAuth,
  placeReportRateLimit,
  placeReportValidator,
  handleValidation,
  placesController.report,
);
router.post(
  '/:id/media/:mediaId/reports',
  requireAuth,
  placeReportRateLimit,
  mediaIdValidator,
  placeReportValidator,
  handleValidation,
  placesController.report,
);

export default router;
