import { Router } from 'express';
import { productsController } from '../controllers/c_products.js'

const router = Router();

router.get('/', productsController.getAllProducts);
router.get('/:product_id', productsController.getProduct);
router.post('/', productsController.createProduct);
router.patch('/:product_id', productsController.updateProductDetails);
router.delete('/:product_id', productsController.deleteProduct);



export default router