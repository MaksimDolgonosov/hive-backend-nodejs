import { Router } from 'express';
import * as mapController from '../controllers/map.controller';
import requireAuth from '../middleware/auth.middleware';
import handleValidation from '../middleware/validate.middleware';
import { bboxZoomValidator } from '../validators/growth.validators';

const router = Router();

router.get(
  '/overview',
  requireAuth,
  bboxZoomValidator,
  handleValidation,
  mapController.overview,
);

export default router;
