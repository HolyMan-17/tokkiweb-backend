import * as db from '../config/db.js'; 

export const productsController = {
    async getAllProducts(req, res, next){
        try{
            const category = req.query.category;
            let prodsquery;
            if (typeof category === 'string' && category.trim() !== ''){
                prodsquery = await db.query(
                    `
                    SELECT product_id, product_name, product_price, product_description, category, qty_available, in_stock
                    FROM tokki_shop.products
                    WHERE is_archived = false AND category = $1;
                    `,
                    [category.trim()]
                );
            } else {
                prodsquery = await db.query(
                    `
                    SELECT product_id, product_name, product_price, product_description, category, qty_available, in_stock
                    FROM tokki_shop.products
                    WHERE is_archived = false;
                    `
                );
            }
            if (prodsquery.rows.length === 0){
                return res.status(200).json({success:true, message:"There's no registered products."});
            }
            return res.status(200).json({ success: true, data: prodsquery.rows });
        }catch(err){
            next(err);
        }
    },

    async getProduct(req, res, next){
        try{
            const productId = req.params.product_id
            const querytext =
                `
                SELECT product_id, product_name, product_price, product_description, category, qty_available, in_stock
                FROM tokki_shop.products
                WHERE product_id = $1 AND is_archived = false;
                `
            const resquery = await db.query(querytext, [productId]);
            if (resquery.rows.length === 0){
                return res.status(404).json({success: false, message: "Product was not found."});
            }
            return res.status(200).json({ success: true, data: resquery.rows[0] });
        }catch(err){
            next(err);
        }
    },

    async createProduct(req, res, next){
        const dbClient = await db.getClient();
        try{
            const {product_name, product_price, product_description, category, qty_available} = req.body;
            if (!product_name || !product_price || product_description === undefined || qty_available === undefined){
                return res.status(400).json({success: false, message: "All product fields are required!"})
            }
            if (typeof category !== 'string' || category.trim() === '' || category.trim().length > 100){
                return res.status(400).json({success: false, message: "A valid product category is required."})
            }
            if (qty_available < 0){
                return res.status(400).json({success: false, message: "Product quantity can't be negative."})
            }
            const in_stock = qty_available > 0 ? true : false;
            const createQuery = `INSERT INTO
            tokki_shop.products(product_name, product_price, product_description, category, qty_available, in_stock)
            VALUES($1, $2, $3, $4, $5, $6)
            RETURNING product_id, product_name, product_price, product_description, category, qty_available, in_stock, is_archived;
            `;
            const values = [product_name, product_price, product_description, category.trim(), qty_available, in_stock];
            await dbClient.query('BEGIN');
            const resultQuery = await dbClient.query(createQuery, values);
            await dbClient.query('COMMIT');

            return res.status(201).json({success: true, row: resultQuery.rows[0]});
        }catch(err){
            if(dbClient){
                await dbClient.query('ROLLBACK');
            }
            next(err);
        }finally{
            if(dbClient){
                await dbClient.release();
            }
        }
    },

    async updateProductDetails (req, res, next) {
        const dbClient = await db.getClient();
        try{
            const productId = req.params.product_id;
            const {product_name, product_price, product_description, category, qty_available} = req.body;

            if (category !== undefined && (typeof category !== 'string' || category.trim() === '' || category.trim().length > 100)){
                return res.status(400).json({success: false, message: "A valid product category is required."})
            }

            const queryArchive = await db.query('SELECT is_archived FROM tokki_shop.products WHERE product_id = $1', [productId]);

            if (queryArchive.rows.length === 0){
                return res.status(404).json({success: false, message: "Product was not found."});
            }

            const is_archived = queryArchive.rows[0].is_archived;

            if(is_archived){
                return res.status(401).json({success: false, message: "Product is archived."});
            }
            

            if(product_name === undefined && product_price === undefined && product_description === undefined &&
                qty_available === undefined && category === undefined){
                return res.status(400).json({success: false, message: "At least 1 product field needs to be updated."})
            }

            const checkQuery = await db.query('SELECT * FROM tokki_shop.products WHERE product_id = $1', [productId]);
            if(checkQuery.rows.length === 0){
                return res.status(404).json({success: false, message: "Product ID is not valid"});
            }

            const updatedName = product_name !== undefined ? product_name : checkQuery.rows[0].product_name;
            const updatedPrice = product_price !== undefined ? product_price : checkQuery.rows[0].product_price;
            const updatedDescription = product_description !== undefined ? product_description : checkQuery.rows[0].product_description;
            const updatedCategory = category !== undefined ? category.trim() : checkQuery.rows[0].category;
            const updatedQuantity = (qty_available !== undefined && qty_available >= 0) ? qty_available : checkQuery.rows[0].qty_available;
            const updatedStockStatus = updatedQuantity > 0 ? true : false

            const updateQuery = `
            UPDATE tokki_shop.products
            SET product_name = $1, product_price = $2, product_description = $3, category = $4, qty_available = $5, in_stock = $6
            WHERE product_id = $7
            RETURNING product_id, product_name, product_price, product_description, category, qty_available, in_stock;
            `
            const values = [updatedName, updatedPrice, updatedDescription, updatedCategory, updatedQuantity, updatedStockStatus, productId];
            
            await dbClient.query('BEGIN');
            const resQuery = await dbClient.query(updateQuery, values);
            await dbClient.query('COMMIT');

            return res.status(200).json({success:true, updated_row: resQuery.rows[0]});
        }catch(err){
            if(dbClient){
                await dbClient.query('ROLLBACK');
            }
            next(err)
        }finally{
            if(dbClient){
                await dbClient.release();
            }
        }
    },

    async deleteProduct(req, res, next) {
        const dbClient = await db.getClient();    
        try{
            const productId = req.params.product_id
            const queryCheck = await db.query(`SELECT * FROM tokki_shop.products WHERE product_id = $1`, [productId]);

            if(queryCheck.rows.length === 0){
                return res.status(404).json({success: false, message: "Product ID is not valid."});
            }
            
            const deleteQuery = 
            `
            UPDATE tokki_shop.products SET is_archived = TRUE, qty_available = 0, in_stock = FALSE WHERE product_id = $1;
            `
            await dbClient.query('BEGIN');
            await dbClient.query(deleteQuery, [productId]);
            await dbClient.query('COMMIT');
            
            return res.status(200).json({success: true, message: 'Product successfully archived'})
        }catch(err){
            if(dbClient){
                await dbClient.query('ROLLBACK');
            }
            next(err);
        }finally{
            if(dbClient){
                await dbClient.release();
            }
        }
    }
}