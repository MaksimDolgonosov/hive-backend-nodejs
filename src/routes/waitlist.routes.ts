import { Router } from 'express';
import * as waitlistController from '../controllers/waitlist.controller';
import { waitlistRateLimit } from '../middleware/rate-limit.middleware';
import handleValidation from '../middleware/validate.middleware';
import { waitlistValidator } from '../validators/growth.validators';

const router = Router();

router.post('/', waitlistRateLimit, waitlistValidator, handleValidation, waitlistController.submit);

export default router;
