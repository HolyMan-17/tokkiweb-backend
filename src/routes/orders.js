import { Router } from 'express';
import { ordersController } from '../controllers/c_orders.js'

const router = Router();

router.post('/', ordersController.createOrder);
router.get('/', ordersController.getAllOrders);
router.get('/client/:client_id', ordersController.getClientHistory);
router.get('/:order_id', ordersController.getSingleOrder);
router.patch('/:order_id/cancel', ordersController.cancelOrder);
export default router
