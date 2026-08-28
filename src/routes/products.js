import { Router } from 'express';
import { productsController } from '../controllers/c_products.js';
import { requireAdmin } from '../middleware/auth.js';
import { uploadImage } from '../middleware/upload.js';
import { uploadLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.get('/', productsController.getAllProducts);
router.get('/:product_id', productsController.getProduct);
router.post('/', requireAdmin, productsController.createProduct);
router.patch('/:product_id', requireAdmin, productsController.updateProductDetails);
router.delete('/:product_id', requireAdmin, productsController.deleteProduct);
router.post('/:product_id/image', uploadLimiter, requireAdmin, uploadImage, productsController.setProductImage);
router.delete('/:product_id/image', requireAdmin, productsController.removeProductImage);

export default router;