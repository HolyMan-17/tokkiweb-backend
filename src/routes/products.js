import { Router } from 'express';
import { productsController } from '../controllers/c_products.js'
import { requireAdmin } from '../middleware/auth.js'

const router = Router();

router.get('/', productsController.getAllProducts);
router.get('/:product_id', productsController.getProduct);
router.post('/', requireAdmin, productsController.createProduct);
router.patch('/:product_id', requireAdmin, productsController.updateProductDetails);
router.delete('/:product_id', requireAdmin, productsController.deleteProduct);



export default router