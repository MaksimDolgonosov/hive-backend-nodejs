import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import requireAuth from '../middleware/auth.middleware';
import { handleAvatarUpload } from '../middleware/upload.middleware';
import handleValidation from '../middleware/validate.middleware';
import {
  googleLoginValidator,
  loginValidator,
  refreshValidator,
  registerValidator,
  updateProfileValidator,
} from '../validators/auth.validators';

const router = Router();

router.post('/register', registerValidator, handleValidation, authController.register);
router.post('/login', loginValidator, handleValidation, authController.login);
router.post('/google', googleLoginValidator, handleValidation, authController.loginWithGoogle);
router.post('/refresh', refreshValidator, handleValidation, authController.refresh);
router.post('/logout', refreshValidator, handleValidation, authController.logout);
router.post('/me/avatar', requireAuth, handleAvatarUpload, authController.uploadAvatar);
router.delete('/me/avatar', requireAuth, authController.removeAvatar);
router.patch('/me', requireAuth, updateProfileValidator, handleValidation, authController.updateProfile);
router.get('/me/stats', requireAuth, authController.meStats);
router.get('/me', requireAuth, authController.me);

export default router;
