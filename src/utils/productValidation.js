const isValidName = (value) => typeof value === 'string' && value.trim() !== '';
const isValidPrice = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const isValidDescription = (value) => typeof value === 'string' && value.trim() !== '';
const isValidQty = (value) => Number.isInteger(value) && value >= 0;
const isValidCategory = (value) =>
    typeof value === 'string' && value.trim() !== '' && value.trim().length <= 100;

export const validateProductCreate = (body) => {
    if (body === null || typeof body !== 'object'){
        return { ok: false, message: 'All product fields are required!' };
    }

    const { product_name, product_price, product_description, category, qty_available } = body;

    if (!isValidName(product_name) || !isValidPrice(product_price) ||
        !isValidDescription(product_description) || !isValidQty(qty_available)){
        return { ok: false, message: 'All product fields are required!' };
    }

    if (!isValidCategory(category)){
        return { ok: false, message: 'A valid product category is required.' };
    }

    return { ok: true };
};

export const validateProductPatch = (body) => {
    if (body === null || typeof body !== 'object'){
        return { ok: false, message: 'At least 1 product field needs to be updated.' };
    }

    const { product_name, product_price, product_description, category, qty_available } = body;

    if (product_name !== undefined && !isValidName(product_name)){
        return { ok: false, message: 'product_name must be a non-empty string.' };
    }
    if (product_price !== undefined && !isValidPrice(product_price)){
        return { ok: false, message: 'product_price must be a positive number.' };
    }
    if (product_description !== undefined && !isValidDescription(product_description)){
        return { ok: false, message: 'product_description must be a non-empty string.' };
    }
    if (category !== undefined && !isValidCategory(category)){
        return { ok: false, message: 'A valid product category is required.' };
    }
    if (qty_available !== undefined){
        if (!Number.isInteger(qty_available)){
            return { ok: false, message: 'Product quantity must be a whole number.' };
        }
        if (qty_available < 0){
            return { ok: false, message: "Product quantity can't be negative." };
        }
    }

    return { ok: true };
};

export const validateOrderItems = (items) => {
    if (!Array.isArray(items) || items.length === 0){
        return { ok: false, message: 'Valid delivery_type, payment_method, and items are required.' };
    }

    for (const item of items){
        if (item === null || typeof item !== 'object' ||
            !Number.isInteger(item.product_id) || item.product_id <= 0 ||
            !Number.isInteger(item.product_qty) || item.product_qty <= 0){
            return { ok: false, message: 'Each item needs a valid product_id and a positive whole product_qty.' };
        }
    }

    return { ok: true };
};
