import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import requireAuth from '../middleware/auth.middleware';
import handleValidation from '../middleware/validate.middleware';
import {
  loginValidator,
  refreshValidator,
  registerValidator,
} from '../validators/auth.validators';

const router = Router();

router.post('/register', registerValidator, handleValidation, authController.register);
router.post('/login', loginValidator, handleValidation, authController.login);
router.post('/refresh', refreshValidator, handleValidation, authController.refresh);
router.post('/logout', refreshValidator, handleValidation, authController.logout);
router.get('/me', requireAuth, authController.me);

export default router;
