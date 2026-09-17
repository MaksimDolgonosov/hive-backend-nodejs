import { Router } from 'express';
import * as invitesController from '../controllers/invites.controller';
import requireAuth from '../middleware/auth.middleware';
import { inviteCreateRateLimit } from '../middleware/rate-limit.middleware';
import handleValidation from '../middleware/validate.middleware';
import { inviteCodeValidator, inviteCreateValidator } from '../validators/growth.validators';

const router = Router();

router.post(
  '/',
  requireAuth,
  inviteCreateRateLimit,
  inviteCreateValidator,
  handleValidation,
  invitesController.create,
);
router.get('/me', requireAuth, invitesController.me);
router.get('/:code', inviteCodeValidator, handleValidation, invitesController.getByCode);

export default router;
