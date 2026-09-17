import { Router } from 'express';
import * as campaignsController from '../controllers/campaigns.controller';
import requireAuth from '../middleware/auth.middleware';
import handleValidation from '../middleware/validate.middleware';
import { latLngQueryValidator } from '../validators/growth.validators';

const router = Router();

router.get(
  '/active',
  requireAuth,
  latLngQueryValidator,
  handleValidation,
  campaignsController.active,
);

export default router;
