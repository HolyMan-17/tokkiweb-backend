import { Router } from 'express';
import productsRouter from './products.js';
import ordersRouter from './orders.js';
import analyticsRouter from './analytics.js';

const router = Router();

router.use('/products', productsRouter);
router.use('/orders', ordersRouter);
router.use('/analytics', analyticsRouter);

export default router;