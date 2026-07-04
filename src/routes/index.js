import { Router } from 'express';
import productsRouter from './products.js';
// import usersRouter from './users.js';
// import ordersRouter from './orders.js';

const router = Router();

router.use('/products', productsRouter);
// router.use('/users', usersRouter);
// router.use('/orders', ordersRouter);

export default router;