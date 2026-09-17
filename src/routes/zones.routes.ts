import { Router } from 'express';
import * as zonesController from '../controllers/zones.controller';
import requireAuth from '../middleware/auth.middleware';
import handleValidation from '../middleware/validate.middleware';
import { latLngQueryValidator } from '../validators/growth.validators';

const router = Router();

router.get(
  '/current',
  requireAuth,
  latLngQueryValidator,
  handleValidation,
  zonesController.current,
);

export default router;
