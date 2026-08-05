import { Router } from 'express';
import { ordersController } from '../controllers/c_orders.js'

const router = Router();

router.post('/', ordersController.createOrder);
router.get('/', ordersController.getAllOrders);

export default router
