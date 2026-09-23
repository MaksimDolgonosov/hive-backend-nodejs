import { Router } from 'express';

import * as partnerController from '../controllers/partner.controller';
import requireAuth from '../middleware/auth.middleware';
import {
  partnerApplicationCreateRateLimit,
  partnerOnsiteRateLimit,
  partnerSubmitRateLimit,
} from '../middleware/rate-limit.middleware';
import { handlePlacePhotoUpload } from '../middleware/upload.middleware';
import handleValidation from '../middleware/validate.middleware';
import {
  applicationBodyValidator,
  applicationIdValidator,
  onsiteValidator,
} from '../validators/partner.validators';

const router = Router();

router.post(
  '/',
  requireAuth,
  partnerApplicationCreateRateLimit,
  applicationBodyValidator,
  handleValidation,
  partnerController.create,
);
router.get('/me', requireAuth, partnerController.mine);
router.patch(
  '/:id',
  requireAuth,
  applicationIdValidator,
  applicationBodyValidator,
  handleValidation,
  partnerController.update,
);
router.post(
  '/:id/onsite',
  requireAuth,
  partnerOnsiteRateLimit,
  handlePlacePhotoUpload,
  onsiteValidator,
  handleValidation,
  partnerController.onsite,
);
router.post(
  '/:id/submit',
  requireAuth,
  partnerSubmitRateLimit,
  applicationIdValidator,
  handleValidation,
  partnerController.submit,
);

export default router;
