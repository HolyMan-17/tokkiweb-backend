import * as db from '../config/db.js';
import { saveProductImage, deleteProductImage, toPublicImageUrl, toImageKey, attachImageUrls, cleanupProductImages } from '../utils/storage.js';
import { validateProductCreate, validateProductPatch } from '../utils/productValidation.js';
import { parseIdParam } from '../utils/params.js';

const MAX_PRODUCT_IMAGES = 5;

export const addProductImage = async (deps, productId, buffer) => {
    const state = await deps.loadProductState(productId);

    if (!state?.exists){
        return { status: 404, message: 'Product was not found.' };
    }
    if (state.is_archived){
        return { status: 404, message: 'Product is archived.' };
    }
    if ((state.image_count ?? 0) >= MAX_PRODUCT_IMAGES){
        return { status: 409, message: 'This product already has the maximum of 5 images.' };
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
        if (err?.code === '23505' || err?.code === '23514'){
            return { status: 409, message: 'This product already has the maximum of 5 images.' };
        }
        return { error: err };
    }

    if (persisted === false){
        await deps.removeFile(newKey);
        return { status: 404, message: 'Product is archived.' };
    }

    return { ok: true, imageKey: newKey };
};

export const removeProductImageByUrl = async (deps, productId, url) => {
    const imageKey = toImageKey(url);
    if (!imageKey){
        return { status: 400, message: 'Unknown image URL.' };
    }

    const state = await deps.loadProductState(productId);

    if (!state?.exists){
        return { status: 404, message: 'Product was not found.' };
    }
    if (state.is_archived){
        return { status: 404, message: 'Product is archived.' };
    }

    const galleryKeys = await deps.loadGalleryKeys(productId);
    if (!galleryKeys.includes(imageKey)){
        return { status: 404, message: 'Image was not found.' };
    }

    let persisted;
    try{
        persisted = await deps.persistRemove(productId, imageKey);
    }catch(err){
        return { error: err };
    }

    if (persisted === false){
        return { status: 404, message: 'Product is archived.' };
    }

    await deps.removeFile(imageKey);

    return { ok: true, imageKey };
};

export const replaceCoverImage = async (deps, productId, buffer) => {
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

    const oldKey = state.cover_key;
    if (oldKey && oldKey !== newKey){
        await deps.removeFile(oldKey);
    }

    return { ok: true, imageKey: newKey };
};

export const clearCoverImage = async (deps, productId) => {
    const state = await deps.loadProductState(productId);

    if (!state?.exists){
        return { status: 404, message: 'Product was not found.' };
    }
    if (state.is_archived){
        return { status: 404, message: 'Product is archived.' };
    }

    const galleryKeys = await deps.loadGalleryKeys(productId);
    const coverKey = galleryKeys[0] ?? null;

    if (!coverKey){
        return { ok: true };
    }

    let persisted;
    try{
        persisted = await deps.persistRemove(productId, coverKey);
    }catch(err){
        return { error: err };
    }

    if (persisted === false){
        return { status: 404, message: 'Product is archived.' };
    }

    await deps.removeFile(coverKey);

    return { ok: true };
};

export const reorderProductImages = async (deps, productId, urls) => {
    const imageKeys = Array.isArray(urls) ? urls.map(toImageKey) : null;
    if (!imageKeys || imageKeys.some((key) => !key)){
        return { status: 400, message: 'Unknown image URL.' };
    }

    const state = await deps.loadProductState(productId);

    if (!state?.exists){
        return { status: 404, message: 'Product was not found.' };
    }
    if (state.is_archived){
        return { status: 404, message: 'Product is archived.' };
    }

    const galleryKeys = await deps.loadGalleryKeys(productId);
    const isExactSet = imageKeys.length === galleryKeys.length &&
        imageKeys.every((key) => galleryKeys.includes(key)) &&
        new Set(imageKeys).size === imageKeys.length;
    if (!isExactSet){
        return { status: 400, message: 'Invalid image order.' };
    }

    try{
        await deps.persistReorder(productId, imageKeys);
    }catch(err){
        return { error: err };
    }

    return { ok: true };
};

const fetchGalleryKeys = async (dbClient, productId) => {
    const q = await dbClient.query(
        'SELECT image_key FROM tokki_shop.product_images WHERE product_id = $1 ORDER BY sort_order',
        [productId]
    );
    return q.rows.map((row) => row.image_key);
};

const fetchGalleryPayload = async (dbClient, productId) => {
    const keys = await fetchGalleryKeys(dbClient, productId);
    const urls = keys.map(toPublicImageUrl);
    return {
        product_id: productId,
        product_image_urls: urls,
        product_image_url: urls[0] ?? null
    };
};

export const productsController = {
    async getAllProducts(req, res, next){
        try{
            const category = req.query.category;
            let prodsquery;
            if (typeof category === 'string' && category.trim() !== ''){
                prodsquery = await db.query(
                    `
                    SELECT product_id, product_name, product_price, product_description, category, qty_available, in_stock,
                        COALESCE((
                            SELECT array_agg(pi.image_key ORDER BY pi.sort_order)
                            FROM tokki_shop.product_images pi
                            WHERE pi.product_id = p.product_id
                        ), '{}') AS image_keys
                    FROM tokki_shop.products p
                    WHERE is_archived = false AND category = $1;
                    `,
                    [category.trim()]
                );
            } else {
                prodsquery = await db.query(
                    `
                    SELECT product_id, product_name, product_price, product_description, category, qty_available, in_stock,
                        COALESCE((
                            SELECT array_agg(pi.image_key ORDER BY pi.sort_order)
                            FROM tokki_shop.product_images pi
                            WHERE pi.product_id = p.product_id
                        ), '{}') AS image_keys
                    FROM tokki_shop.products p
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
                SELECT product_id, product_name, product_price, product_description, category, qty_available, in_stock,
                    COALESCE((
                        SELECT array_agg(pi.image_key ORDER BY pi.sort_order)
                        FROM tokki_shop.product_images pi
                        WHERE pi.product_id = p.product_id
                    ), '{}') AS image_keys
                FROM tokki_shop.products p
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
            RETURNING product_id, product_name, product_price, product_description, category, qty_available, in_stock, is_archived;
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
            RETURNING product_id, product_name, product_price, product_description, category, qty_available, in_stock;
            `
            const values = [updatedName, updatedPrice, updatedDescription, updatedCategory, updatedQuantity, updatedStockStatus, productId];

            await dbClient.query('BEGIN');
            const resQuery = await dbClient.query(updateQuery, values);
            const imageKeys = await fetchGalleryKeys(dbClient, productId);
            await dbClient.query('COMMIT');

            return res.status(200).json({success:true, updated_row: attachImageUrls({ ...resQuery.rows[0], image_keys: imageKeys })});
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

            const galleryKeys = await fetchGalleryKeys(dbClient, productId);

            const deleteQuery =
            `
            UPDATE tokki_shop.products SET is_archived = TRUE, qty_available = 0, in_stock = FALSE WHERE product_id = $1;
            `
            await dbClient.query('BEGIN');
            await dbClient.query('DELETE FROM tokki_shop.product_images WHERE product_id = $1', [productId]);
            await dbClient.query(deleteQuery, [productId]);
            await dbClient.query('COMMIT');

            await cleanupProductImages(galleryKeys, deleteProductImage);

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

    async addProductImage(req, res, next) {
        const dbClient = await db.getClient();
        try{
            const productId = parseIdParam(req.params.product_id);
            if (!productId){
                return res.status(400).json({success: false, message: "Invalid ID format."});
            }

            const result = await addProductImage({
                loadProductState: async (id) => {
                    const q = await db.query(
                        `
                        SELECT p.is_archived,
                            (SELECT count(*) FROM tokki_shop.product_images pi WHERE pi.product_id = p.product_id) AS image_count
                        FROM tokki_shop.products p
                        WHERE p.product_id = $1
                        `,
                        [id]
                    );
                    if (q.rows.length === 0){
                        return { exists: false };
                    }
                    return {
                        exists: true,
                        is_archived: q.rows[0].is_archived,
                        image_count: Number(q.rows[0].image_count)
                    };
                },
                saveFile: (buffer) => saveProductImage(buffer),
                persistKey: async (id, key) => {
                    await dbClient.query('BEGIN');
                    try{
                        const uq = await dbClient.query(
                            `
                            INSERT INTO tokki_shop.product_images (product_id, image_key, sort_order)
                            SELECT $1, $2, COALESCE((SELECT MAX(sort_order) FROM tokki_shop.product_images WHERE product_id = $1), -1) + 1
                            WHERE EXISTS (SELECT 1 FROM tokki_shop.products WHERE product_id = $1 AND is_archived = false)
                            RETURNING image_id
                            `,
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
                data: await fetchGalleryPayload(dbClient, productId)
            });
        }catch(err){
            next(err);
        }finally{
            if(dbClient){
                await dbClient.release();
            }
        }
    },

    async removeProductImageByUrl(req, res, next) {
        const dbClient = await db.getClient();
        try{
            const productId = parseIdParam(req.params.product_id);
            if (!productId){
                return res.status(400).json({success: false, message: "Invalid ID format."});
            }

            const result = await removeProductImageByUrl({
                loadProductState: async (id) => {
                    const q = await db.query(
                        'SELECT is_archived FROM tokki_shop.products WHERE product_id = $1',
                        [id]
                    );
                    if (q.rows.length === 0){
                        return { exists: false };
                    }
                    return { exists: true, is_archived: q.rows[0].is_archived };
                },
                loadGalleryKeys: async (id) => fetchGalleryKeys(dbClient, id),
                persistRemove: async (id, key) => {
                    await dbClient.query('BEGIN');
                    try{
                        const dq = await dbClient.query(
                            'DELETE FROM tokki_shop.product_images WHERE product_id = $1 AND image_key = $2 RETURNING image_id',
                            [id, key]
                        );
                        await dbClient.query(
                            `
                            WITH ranked AS (
                                SELECT image_id, row_number() OVER (ORDER BY sort_order) AS rn
                                FROM tokki_shop.product_images
                                WHERE product_id = $1
                            )
                            UPDATE tokki_shop.product_images pi
                            SET sort_order = ranked.rn - 1
                            FROM ranked
                            WHERE pi.image_id = ranked.image_id
                              AND pi.sort_order <> ranked.rn - 1
                            `,
                            [id]
                        );
                        await dbClient.query('COMMIT');
                        return dq.rows.length > 0;
                    }catch(e){
                        await dbClient.query('ROLLBACK');
                        throw e;
                    }
                },
                removeFile: (key) => deleteProductImage(key)
            }, productId, req.query.url);

            if (result.error){
                return next(result.error);
            }
            if (!result.ok){
                return res.status(result.status).json({ success: false, message: result.message });
            }

            return res.status(200).json({
                success: true,
                data: await fetchGalleryPayload(dbClient, productId)
            });
        }catch(err){
            next(err);
        }finally{
            if(dbClient){
                await dbClient.release();
            }
        }
    },

    async reorderProductImages(req, res, next) {
        const dbClient = await db.getClient();
        try{
            const productId = parseIdParam(req.params.product_id);
            if (!productId){
                return res.status(400).json({success: false, message: "Invalid ID format."});
            }

            const result = await reorderProductImages({
                loadProductState: async (id) => {
                    const q = await db.query(
                        'SELECT is_archived FROM tokki_shop.products WHERE product_id = $1',
                        [id]
                    );
                    if (q.rows.length === 0){
                        return { exists: false };
                    }
                    return { exists: true, is_archived: q.rows[0].is_archived };
                },
                loadGalleryKeys: async (id) => fetchGalleryKeys(dbClient, id),
                persistReorder: async (id, keys) => {
                    await dbClient.query('BEGIN');
                    try{
                        await dbClient.query(
                            'DELETE FROM tokki_shop.product_images WHERE product_id = $1',
                            [id]
                        );
                        await dbClient.query(
                            `
                            INSERT INTO tokki_shop.product_images (product_id, image_key, sort_order)
                            SELECT $1, d.key, d.ord - 1
                            FROM unnest($2::text[])
                                 WITH ORDINALITY AS d(key, ord)
                            `,
                            [id, keys]
                        );
                        await dbClient.query('COMMIT');
                    }catch(e){
                        await dbClient.query('ROLLBACK');
                        throw e;
                    }
                }
            }, productId, req.body?.urls);

            if (result.error){
                return next(result.error);
            }
            if (!result.ok){
                return res.status(result.status).json({ success: false, message: result.message });
            }

            return res.status(200).json({
                success: true,
                data: await fetchGalleryPayload(dbClient, productId)
            });
        }catch(err){
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

            const result = await replaceCoverImage({
                loadProductState: async (id) => {
                    const q = await db.query(
                        `
                        SELECT p.is_archived,
                            (SELECT pi.image_key
                             FROM tokki_shop.product_images pi
                             WHERE pi.product_id = p.product_id
                             ORDER BY pi.sort_order
                             LIMIT 1) AS cover_key
                        FROM tokki_shop.products p
                        WHERE p.product_id = $1
                        `,
                        [id]
                    );
                    if (q.rows.length === 0){
                        return { exists: false };
                    }
                    return {
                        exists: true,
                        is_archived: q.rows[0].is_archived,
                        cover_key: q.rows[0].cover_key
                    };
                },
                saveFile: (buffer) => saveProductImage(buffer),
                persistKey: async (id, key) => {
                    await dbClient.query('BEGIN');
                    try{
                        const uq = await dbClient.query(
                            `
                            INSERT INTO tokki_shop.product_images (product_id, image_key, sort_order)
                            SELECT $1, $2, 0
                            WHERE EXISTS (SELECT 1 FROM tokki_shop.products WHERE product_id = $1 AND is_archived = false)
                            ON CONFLICT (product_id, sort_order) DO UPDATE SET image_key = EXCLUDED.image_key
                            RETURNING image_id
                            `,
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
                data: await fetchGalleryPayload(dbClient, productId)
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

            const result = await clearCoverImage({
                loadProductState: async (id) => {
                    const q = await db.query(
                        'SELECT is_archived FROM tokki_shop.products WHERE product_id = $1',
                        [id]
                    );
                    if (q.rows.length === 0){
                        return { exists: false };
                    }
                    return { exists: true, is_archived: q.rows[0].is_archived };
                },
                loadGalleryKeys: async (id) => fetchGalleryKeys(dbClient, id),
                persistRemove: async (id, key) => {
                    await dbClient.query('BEGIN');
                    try{
                        const dq = await dbClient.query(
                            'DELETE FROM tokki_shop.product_images WHERE product_id = $1 AND image_key = $2 RETURNING image_id',
                            [id, key]
                        );
                        await dbClient.query(
                            `
                            WITH ranked AS (
                                SELECT image_id, row_number() OVER (ORDER BY sort_order) AS rn
                                FROM tokki_shop.product_images
                                WHERE product_id = $1
                            )
                            UPDATE tokki_shop.product_images pi
                            SET sort_order = ranked.rn - 1
                            FROM ranked
                            WHERE pi.image_id = ranked.image_id
                              AND pi.sort_order <> ranked.rn - 1
                            `,
                            [id]
                        );
                        await dbClient.query('COMMIT');
                        return dq.rows.length > 0;
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
                data: await fetchGalleryPayload(dbClient, productId)
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
