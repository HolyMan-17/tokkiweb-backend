import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_WIDTH = 1600;
const WEBP_QUALITY = 82;
const KEY_PATTERN = /^products\/[0-9a-f-]{36}\.webp$/;

export const resolveUploadDir = (override) =>
    path.resolve(override ?? process.env.UPLOAD_DIR ?? './uploads');

export const saveProductImage = async (buffer, options = {}) => {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0){
        throw new Error('Invalid image payload.');
    }

    const dir = resolveUploadDir(options.uploadDir);

    const optimized = await sharp(buffer)
        .rotate()
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();

    const key = `products/${randomUUID()}.webp`;

    await fs.mkdir(path.join(dir, 'products'), { recursive: true });
    await fs.writeFile(path.join(dir, key), optimized);

    return key;
};

export const deleteProductImage = async (key, options = {}) => {
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)){
        return false;
    }

    try{
        await fs.unlink(path.join(resolveUploadDir(options.uploadDir), key));
        return true;
    }catch{
        return false;
    }
};

export const toPublicImageUrl = (key) => {
    if (!key){
        return null;
    }
    const base = (process.env.PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
    return `${base}/images/${key}`;
};

const withImageUrl = (row) => {
    if (!row || typeof row !== 'object'){
        return row;
    }
    const { product_image, ...rest } = row;
    return { ...rest, product_image_url: toPublicImageUrl(product_image) };
};

export const attachImageUrls = (rows) => {
    if (rows === null || rows === undefined){
        return rows;
    }
    if (Array.isArray(rows)){
        return rows.map(withImageUrl);
    }
    return withImageUrl(rows);
};

export const cleanupProductImages = async (keys, removeFile) => {
    const candidates = Array.isArray(keys) ? keys : [keys];
    const unique = [...new Set(candidates.filter((key) => key))];

    let removed = 0;
    for (const key of unique){
        try{
            if (await removeFile(key)){
                removed += 1;
            }
        }catch{
        }
    }
    return removed;
};
