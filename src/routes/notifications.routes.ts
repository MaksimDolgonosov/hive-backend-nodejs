import { Router } from 'express';
import * as notificationsController from '../controllers/notifications.controller';
import requireAuth from '../middleware/auth.middleware';
import handleValidation from '../middleware/validate.middleware';
import { notificationSettingsValidator } from '../validators/growth.validators';

const router = Router();

router.get('/settings', requireAuth, notificationsController.getSettings);
router.patch(
  '/settings',
  requireAuth,
  notificationSettingsValidator,
  handleValidation,
  notificationsController.patchSettings,
);

export default router;
