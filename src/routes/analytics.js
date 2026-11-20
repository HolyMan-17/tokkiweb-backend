import { Router } from 'express';
import { analyticsController } from '../controllers/c_analytics.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/top-products', requireAdmin, analyticsController.getTopProducts);

export default router;
