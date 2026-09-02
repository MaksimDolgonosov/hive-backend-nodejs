import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import requireAuth from '../middleware/auth.middleware';
import { authEmailRateLimit, authIpRateLimit } from '../middleware/rate-limit.middleware';
import { handleAvatarUpload } from '../middleware/upload.middleware';
import handleValidation from '../middleware/validate.middleware';
import {
  googleLoginValidator,
  loginValidator,
  otpResendValidator,
  otpVerifyValidator,
  passwordForgotValidator,
  passwordResetValidator,
  refreshValidator,
  registerValidator,
  updateProfileValidator,
} from '../validators/auth.validators';
import { profileCollectionValidator } from '../validators/profile.validators';

const router = Router();

router.post(
  '/register',
  authIpRateLimit,
  authEmailRateLimit,
  registerValidator,
  handleValidation,
  authController.register,
);
router.post(
  '/login',
  authIpRateLimit,
  authEmailRateLimit,
  loginValidator,
  handleValidation,
  authController.login,
);
router.post(
  '/otp/verify',
  authIpRateLimit,
  authEmailRateLimit,
  otpVerifyValidator,
  handleValidation,
  authController.verifyOtp,
);
router.post(
  '/otp/resend',
  authIpRateLimit,
  authEmailRateLimit,
  otpResendValidator,
  handleValidation,
  authController.resendOtp,
);
router.post(
  '/password/forgot',
  authIpRateLimit,
  authEmailRateLimit,
  passwordForgotValidator,
  handleValidation,
  authController.forgotPassword,
);
router.post(
  '/password/reset',
  authIpRateLimit,
  authEmailRateLimit,
  passwordResetValidator,
  handleValidation,
  authController.resetPassword,
);
router.post('/google', googleLoginValidator, handleValidation, authController.loginWithGoogle);
router.post('/refresh', refreshValidator, handleValidation, authController.refresh);
router.post('/logout', refreshValidator, handleValidation, authController.logout);
router.post('/me/avatar', requireAuth, handleAvatarUpload, authController.uploadAvatar);
router.delete('/me/avatar', requireAuth, authController.removeAvatar);
router.patch('/me', requireAuth, updateProfileValidator, handleValidation, authController.updateProfile);
router.get('/me/stats', requireAuth, authController.meStats);
router.get(
  '/me/stings',
  requireAuth,
  profileCollectionValidator,
  handleValidation,
  authController.meStings,
);
router.get(
  '/me/hives',
  requireAuth,
  profileCollectionValidator,
  handleValidation,
  authController.meHives,
);
router.get(
  '/me/liked-stings',
  requireAuth,
  profileCollectionValidator,
  handleValidation,
  authController.meLikedStings,
);
router.get('/me', requireAuth, authController.me);

export default router;
