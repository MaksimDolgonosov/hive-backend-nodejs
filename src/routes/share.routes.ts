import { Router } from 'express';
import * as shareController from '../controllers/share.controller';
import { shareRateLimit } from '../middleware/rate-limit.middleware';

const router = Router();

router.get('/stings/:id', shareRateLimit, shareController.sting);
router.get('/places/:id', shareRateLimit, shareController.place);

export default router;
