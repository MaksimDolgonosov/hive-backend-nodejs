import { Router } from 'express';
import * as hivesController from '../controllers/hives.controller';
import requireAuth from '../middleware/auth.middleware';
import handleValidation from '../middleware/validate.middleware';
import { hiveIdValidator, hiveStingsValidator } from '../validators/hives.validators';

const router = Router();

router.get('/:id/stings', requireAuth, hiveStingsValidator, handleValidation, hivesController.getStings);
router.get('/:id', requireAuth, hiveIdValidator, handleValidation, hivesController.getById);

export default router;
