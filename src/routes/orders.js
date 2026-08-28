import { Router } from 'express';
import { ordersController } from '../controllers/c_orders.js';
import { requireAdmin } from '../middleware/auth.js';
import { checkoutLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.post('/', checkoutLimiter, ordersController.createOrder);
router.get('/', requireAdmin, ordersController.getAllOrders);
router.get('/client/:client_id', requireAdmin, ordersController.getClientHistory);
router.get('/receipt/:order_token', ordersController.getOrderReceipt);
router.get('/:order_id', requireAdmin, ordersController.getSingleOrder);
router.patch('/:order_id/cancel', requireAdmin, ordersController.cancelOrder);
router.patch('/:order_id/approve', requireAdmin, ordersController.approveOrder);
export default router;
