import { Router } from 'express';
import * as usersController from '../controllers/users.controller';
import requireAuth from '../middleware/auth.middleware';
import handleValidation from '../middleware/validate.middleware';
import { userIdValidator } from '../validators/users.validators';

const router = Router();

router.get('/:id', requireAuth, userIdValidator, handleValidation, usersController.getById);

export default router;
