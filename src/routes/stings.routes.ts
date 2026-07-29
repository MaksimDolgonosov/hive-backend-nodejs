import { Router } from 'express';
import * as stingsController from '../controllers/stings.controller';
import requireAuth from '../middleware/auth.middleware';
import { stingCreateRateLimit } from '../middleware/rate-limit.middleware';
import { handleStingPhotoUpload } from '../middleware/upload.middleware';
import handleValidation from '../middleware/validate.middleware';
import {
  createStingValidator,
  nearbyValidator,
  reactionValidator,
  stingIdValidator,
} from '../validators/stings.validators';

const router = Router();

router.get('/nearby', requireAuth, nearbyValidator, handleValidation, stingsController.nearby);
router.post(
  '/',
  requireAuth,
  stingCreateRateLimit,
  handleStingPhotoUpload,
  createStingValidator,
  handleValidation,
  stingsController.create,
);
router.get('/:id', requireAuth, stingIdValidator, handleValidation, stingsController.getById);
router.post(
  '/:id/reactions',
  requireAuth,
  stingIdValidator,
  reactionValidator,
  handleValidation,
  stingsController.react,
);
router.delete('/:id', requireAuth, stingIdValidator, handleValidation, stingsController.remove);

export default router;
