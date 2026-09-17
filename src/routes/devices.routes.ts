import { Router } from 'express';
import * as devicesController from '../controllers/devices.controller';
import requireAuth from '../middleware/auth.middleware';
import { deviceRegisterRateLimit } from '../middleware/rate-limit.middleware';
import handleValidation from '../middleware/validate.middleware';
import { deviceIdValidator, deviceValidator } from '../validators/growth.validators';

const router = Router();

router.post(
  '/',
  requireAuth,
  deviceRegisterRateLimit,
  deviceValidator,
  handleValidation,
  devicesController.register,
);
router.delete(
  '/:deviceId',
  requireAuth,
  deviceIdValidator,
  handleValidation,
  devicesController.remove,
);

export default router;
