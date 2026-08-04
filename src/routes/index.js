import { Router } from 'express';
import productsRouter from './products.js';
import ordersRouter from './orders.js';

const router = Router();

router.use('/products', productsRouter);
router.use('/orders', ordersRouter);

export default router;