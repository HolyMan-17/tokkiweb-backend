import * as db from '../config/db.js';
import { saveProductImage, deleteProductImage, toPublicImageUrl, attachImageUrls, cleanupProductImages } from '../utils/storage.js';
import { validateProductCreate, validateProductPatch } from '../utils/productValidation.js';
import { parseIdParam } from '../utils/params.js';

export const applyProductImage = async (deps, productId, buffer) => {
    const state = await deps.loadProductState(productId);

    if (!state?.exists){
        return { status: 404, message: 'Product was not found.' };
    }
    if (state.is_archived){
        return { status: 404, message: 'Product is archived.' };
    }

    let newKey;
    try{
        newKey = await deps.saveFile(buffer);
    }catch(err){
        return { status: 400, message: err.message || 'Invalid image payload.' };
    }

    let persisted;
    try{
        persisted = await deps.persistKey(productId, newKey);
    }catch(err){
        await deps.removeFile(newKey);
        return { error: err };
    }

    if (persisted === false){
        await deps.removeFile(newKey);
        return { status: 404, message: 'Product is archived.' };
    }

    const oldKey = state.current_image_key;
    if (oldKey && oldKey !== newKey){
        await deps.removeFile(oldKey);
    }

    return { ok: true, imageKey: newKey };
};

export const clearProductImage = async (deps, productId) => {
    const state = await deps.loadProductState(productId);

    if (!state?.exists){
        return { status: 404, message: 'Product was not found.' };
    }
    if (state.is_archived){
        return { status: 404, message: 'Product is archived.' };
    }

    let persisted;
    try{
        persisted = await deps.persistKey(productId);
    }catch(err){
        return { error: err };
    }

    if (persisted === false){
        return { status: 404, message: 'Product is archived.' };
    }

    const oldKey = state.current_image_key;
    if (oldKey){
        await deps.removeFile(oldKey);
    }

    return { ok: true };
};

export const productsController = {
    async getAllProducts(req, res, next){
        try{
            const category = req.query.category;
            let prodsquery;
            if (typeof category === 'string' && category.trim() !== ''){
                prodsquery = await db.query(
                    `
                    SELECT product_id, product_name, product_price, product_description, category, qty_available, in_stock, product_image
                    FROM tokki_shop.products
                    WHERE is_archived = false AND category = $1;
                    `,
                    [category.trim()]
                );
            } else {
                prodsquery = await db.query(
                    `
                    SELECT product_id, product_name, product_price, product_description, category, qty_available, in_stock, product_image
                    FROM tokki_shop.products
                    WHERE is_archived = false;
                    `
                );
            }
            if (prodsquery.rows.length === 0){
                return res.status(200).json({success:true, message:"There's no registered products."});
            }
            return res.status(200).json({ success: true, data: attachImageUrls(prodsquery.rows) });
        }catch(err){
            next(err);
        }
    },

    async getProduct(req, res, next){
        try{
            const productId = parseIdParam(req.params.product_id);
            if (!productId){
                return res.status(400).json({success: false, message: "Invalid ID format."});
            }
            const querytext =
                `
                SELECT product_id, product_name, product_price, product_description, category, qty_available, in_stock, product_image
                FROM tokki_shop.products
                WHERE product_id = $1 AND is_archived = false;
                `
            const resquery = await db.query(querytext, [productId]);
            if (resquery.rows.length === 0){
                return res.status(404).json({success: false, message: "Product was not found."});
            }
            return res.status(200).json({ success: true, data: attachImageUrls(resquery.rows[0]) });
        }catch(err){
            next(err);
        }
    },

    async createProduct(req, res, next){
        const dbClient = await db.getClient();
        try{
            const {product_name, product_price, product_description, category, qty_available} = req.body;
            const check = validateProductCreate(req.body);
            if (!check.ok){
                return res.status(400).json({success: false, message: check.message})
            }
            const in_stock = qty_available > 0 ? true : false;
            const createQuery = `INSERT INTO
            tokki_shop.products(product_name, product_price, product_description, category, qty_available, in_stock)
            VALUES($1, $2, $3, $4, $5, $6)
            RETURNING product_id, product_name, product_price, product_description, category, qty_available, in_stock, is_archived, product_image;
            `;
            const values = [product_name, product_price, product_description, category.trim(), qty_available, in_stock];
            await dbClient.query('BEGIN');
            const resultQuery = await dbClient.query(createQuery, values);
            await dbClient.query('COMMIT');

            return res.status(201).json({success: true, row: attachImageUrls(resultQuery.rows[0])});
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
            const productId = parseIdParam(req.params.product_id);
            if (!productId){
                return res.status(400).json({success: false, message: "Invalid ID format."});
            }
            const {product_name, product_price, product_description, category, qty_available} = req.body;

            const check = validateProductPatch(req.body);
            if (!check.ok){
                return res.status(400).json({success: false, message: check.message})
            }

            const queryArchive = await db.query('SELECT is_archived FROM tokki_shop.products WHERE product_id = $1', [productId]);

            if (queryArchive.rows.length === 0){
                return res.status(404).json({success: false, message: "Product was not found."});
            }

            const is_archived = queryArchive.rows[0].is_archived;

            if(is_archived){
                return res.status(404).json({success: false, message: "Product is archived."});
            }


            if(product_name === undefined && product_price === undefined && product_description === undefined &&
                qty_available === undefined && category === undefined){
                return res.status(400).json({success: false, message: "At least 1 product field needs to be updated."})
            }

            const checkQuery = await db.query('SELECT * FROM tokki_shop.products WHERE product_id = $1', [productId]);

            const updatedName = product_name !== undefined ? product_name : checkQuery.rows[0].product_name;
            const updatedPrice = product_price !== undefined ? product_price : checkQuery.rows[0].product_price;
            const updatedDescription = product_description !== undefined ? product_description : checkQuery.rows[0].product_description;
            const updatedCategory = category !== undefined ? category.trim() : checkQuery.rows[0].category;
            const updatedQuantity = qty_available !== undefined ? qty_available : checkQuery.rows[0].qty_available;
            const updatedStockStatus = updatedQuantity > 0 ? true : false

            const updateQuery = `
            UPDATE tokki_shop.products
            SET product_name = $1, product_price = $2, product_description = $3, category = $4, qty_available = $5, in_stock = $6
            WHERE product_id = $7
            RETURNING product_id, product_name, product_price, product_description, category, qty_available, in_stock, product_image;
            `
            const values = [updatedName, updatedPrice, updatedDescription, updatedCategory, updatedQuantity, updatedStockStatus, productId];
            
            await dbClient.query('BEGIN');
            const resQuery = await dbClient.query(updateQuery, values);
            await dbClient.query('COMMIT');

            return res.status(200).json({success:true, updated_row: attachImageUrls(resQuery.rows[0])});
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
            const productId = parseIdParam(req.params.product_id);
            if (!productId){
                return res.status(400).json({success: false, message: "Invalid ID format."});
            }
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

            await cleanupProductImages([queryCheck.rows[0].product_image], deleteProductImage);

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
    },

    async setProductImage(req, res, next) {
        const dbClient = await db.getClient();
        try{
            const productId = parseIdParam(req.params.product_id);
            if (!productId){
                return res.status(400).json({success: false, message: "Invalid ID format."});
            }

            const result = await applyProductImage({
                loadProductState: async (id) => {
                    const q = await db.query(
                        'SELECT is_archived, product_image FROM tokki_shop.products WHERE product_id = $1',
                        [id]
                    );
                    if (q.rows.length === 0){
                        return { exists: false };
                    }
                    return {
                        exists: true,
                        is_archived: q.rows[0].is_archived,
                        current_image_key: q.rows[0].product_image
                    };
                },
                saveFile: (buffer) => saveProductImage(buffer),
                persistKey: async (id, key) => {
                    await dbClient.query('BEGIN');
                    try{
                        const uq = await dbClient.query(
                            'UPDATE tokki_shop.products SET product_image = $2 WHERE product_id = $1 AND is_archived = false RETURNING product_id',
                            [id, key]
                        );
                        await dbClient.query('COMMIT');
                        return uq.rows.length > 0;
                    }catch(e){
                        await dbClient.query('ROLLBACK');
                        throw e;
                    }
                },
                removeFile: (key) => deleteProductImage(key)
            }, productId, req.file.buffer);

            if (result.error){
                return next(result.error);
            }
            if (!result.ok){
                return res.status(result.status).json({ success: false, message: result.message });
            }

            return res.status(200).json({
                success: true,
                data: {
                    product_id: productId,
                    product_image_url: toPublicImageUrl(result.imageKey)
                }
            });
        }catch(err){
            next(err);
        }finally{
            if(dbClient){
                await dbClient.release();
            }
        }
    },

    async removeProductImage(req, res, next) {
        const dbClient = await db.getClient();
        try{
            const productId = parseIdParam(req.params.product_id);
            if (!productId){
                return res.status(400).json({success: false, message: "Invalid ID format."});
            }

            const result = await clearProductImage({
                loadProductState: async (id) => {
                    const q = await db.query(
                        'SELECT is_archived, product_image FROM tokki_shop.products WHERE product_id = $1',
                        [id]
                    );
                    if (q.rows.length === 0){
                        return { exists: false };
                    }
                    return {
                        exists: true,
                        is_archived: q.rows[0].is_archived,
                        current_image_key: q.rows[0].product_image
                    };
                },
                persistKey: async (id) => {
                    await dbClient.query('BEGIN');
                    try{
                        const uq = await dbClient.query(
                            'UPDATE tokki_shop.products SET product_image = NULL WHERE product_id = $1 AND is_archived = false RETURNING product_id',
                            [id]
                        );
                        await dbClient.query('COMMIT');
                        return uq.rows.length > 0;
                    }catch(e){
                        await dbClient.query('ROLLBACK');
                        throw e;
                    }
                },
                removeFile: (key) => deleteProductImage(key)
            }, productId);

            if (result.error){
                return next(result.error);
            }
            if (!result.ok){
                return res.status(result.status).json({ success: false, message: result.message });
            }

            return res.status(200).json({
                success: true,
                data: {
                    product_id: productId,
                    product_image_url: null
                }
            });
        }catch(err){
            next(err);
        }finally{
            if(dbClient){
                await dbClient.release();
            }
        }
    }
}