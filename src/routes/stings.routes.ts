import { Router } from 'express';
import * as stingsController from '../controllers/stings.controller';
import requireAuth from '../middleware/auth.middleware';
import { handleStingPhotoUpload } from '../middleware/upload.middleware';
import handleValidation from '../middleware/validate.middleware';
import {
  createStingValidator,
  nearbyValidator,
  stingIdValidator,
} from '../validators/stings.validators';

const router = Router();

router.get('/nearby', requireAuth, nearbyValidator, handleValidation, stingsController.nearby);
router.post(
  '/',
  requireAuth,
  handleStingPhotoUpload,
  createStingValidator,
  handleValidation,
  stingsController.create,
);
router.get('/:id', requireAuth, stingIdValidator, handleValidation, stingsController.getById);
router.delete('/:id', requireAuth, stingIdValidator, handleValidation, stingsController.remove);

export default router;
