import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {
    saveProductImage,
    deleteProductImage,
    toPublicImageUrl,
    attachImageUrls
} from '../src/utils/storage.js';

const makePng = async (width, height = 100) =>
    sharp({
        create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } }
    })
        .png()
        .toBuffer();

describe('saveProductImage', () => {
    let uploadDir;

    beforeEach(async () => {
        uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokki-uploads-'));
    });

    afterEach(async () => {
        await fs.rm(uploadDir, { recursive: true, force: true });
    });

    test('writes a webp file under products/ and returns a matching key', async () => {
        const key = await saveProductImage(await makePng(800), { uploadDir });

        expect(key).toMatch(/^products\/[0-9a-f-]{36}\.webp$/);

        const onDisk = await fs.readFile(path.join(uploadDir, key));
        const meta = await sharp(onDisk).metadata();
        expect(meta.format).toBe('webp');
        expect(meta.width).toBe(800);
    });

    test('downscales images wider than 1600px', async () => {
        const key = await saveProductImage(await makePng(2400), { uploadDir });
        const onDisk = await fs.readFile(path.join(uploadDir, key));
        const meta = await sharp(onDisk).metadata();
        expect(meta.width).toBe(1600);
    });

    test('never enlarges small images', async () => {
        const key = await saveProductImage(await makePng(500), { uploadDir });
        const onDisk = await fs.readFile(path.join(uploadDir, key));
        const meta = await sharp(onDisk).metadata();
        expect(meta.width).toBe(500);
    });

    test('generates a unique key per call', async () => {
        const buf = await makePng(300);
        const a = await saveProductImage(buf, { uploadDir });
        const b = await saveProductImage(buf, { uploadDir });
        expect(a).not.toBe(b);
    });

    test('rejects corrupt image data', async () => {
        await expect(
            saveProductImage(Buffer.from('this is not an image at all'), { uploadDir })
        ).rejects.toThrow();
    });

    test('rejects empty or non-buffer input', async () => {
        await expect(saveProductImage(Buffer.alloc(0), { uploadDir })).rejects.toThrow();
        await expect(saveProductImage(undefined, { uploadDir })).rejects.toThrow();
    });
});

describe('deleteProductImage', () => {
    let uploadDir;

    beforeEach(async () => {
        uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokki-uploads-'));
    });

    afterEach(async () => {
        await fs.rm(uploadDir, { recursive: true, force: true });
    });

    test('removes the stored file and reports true', async () => {
        const key = await saveProductImage(await makePng(300), { uploadDir });
        await expect(deleteProductImage(key, { uploadDir })).resolves.toBe(true);
        await expect(
            fs.access(path.join(uploadDir, key))
        ).rejects.toThrow();
    });

    test('returns false for a missing file (idempotent)', async () => {
        await expect(
            deleteProductImage('products/does-not-exist.webp', { uploadDir })
        ).resolves.toBe(false);
    });

    test('refuses path traversal and absolute paths without deleting anything', async () => {
        const outside = path.join(uploadDir, '..', 'outside-victim.txt');
        await fs.writeFile(outside, 'precious');

        await expect(deleteProductImage('../outside-victim.txt', { uploadDir })).resolves.toBe(false);
        await expect(deleteProductImage('/etc/passwd', { uploadDir })).resolves.toBe(false);
        await expect(deleteProductImage('..%2F..%2Fetc%2Fpasswd', { uploadDir })).resolves.toBe(false);

        await expect(fs.readFile(outside)).resolves.toEqual(Buffer.from('precious'));
    });

    test('returns false for non-string keys', async () => {
        await expect(deleteProductImage(null, { uploadDir })).resolves.toBe(false);
        await expect(deleteProductImage(12345, { uploadDir })).resolves.toBe(false);
    });
});

describe('toPublicImageUrl', () => {
    const ORIGINAL_BASE = process.env.PUBLIC_BASE_URL;

    afterEach(() => {
        if (ORIGINAL_BASE === undefined) {
            delete process.env.PUBLIC_BASE_URL;
        } else {
            process.env.PUBLIC_BASE_URL = ORIGINAL_BASE;
        }
    });

    test('composes the absolute public URL from PUBLIC_BASE_URL', () => {
        process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
        expect(toPublicImageUrl('products/abc.webp')).toBe('http://localhost:3000/images/products/abc.webp');
    });

    test('strips trailing slashes from the base URL', () => {
        process.env.PUBLIC_BASE_URL = 'https://shop.example.com/';
        expect(toPublicImageUrl('products/abc.webp')).toBe('https://shop.example.com/images/products/abc.webp');
    });

    test('returns null for null/undefined keys', () => {
        process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
        expect(toPublicImageUrl(null)).toBeNull();
        expect(toPublicImageUrl(undefined)).toBeNull();
    });
});

describe('attachImageUrls', () => {
    const ORIGINAL_BASE = process.env.PUBLIC_BASE_URL;

    beforeEach(() => {
        process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
    });

    afterEach(() => {
        if (ORIGINAL_BASE === undefined) {
            delete process.env.PUBLIC_BASE_URL;
        } else {
            process.env.PUBLIC_BASE_URL = ORIGINAL_BASE;
        }
    });

    test('maps an array of rows: strips the raw key and adds the public url', () => {
        const rows = [
            { product_id: 1, product_name: 'A', product_image: 'products/k1.webp' },
            { product_id: 2, product_name: 'B', product_image: null },
            { product_id: 3, product_name: 'C' }
        ];

        const result = attachImageUrls(rows);

        expect(result).toEqual([
            { product_id: 1, product_name: 'A', product_image_url: 'http://localhost:3000/images/products/k1.webp' },
            { product_id: 2, product_name: 'B', product_image_url: null },
            { product_id: 3, product_name: 'C', product_image_url: null }
        ]);
    });

    test('accepts a single row object', () => {
        const result = attachImageUrls({ product_id: 9, product_image: 'products/k2.webp' });

        expect(result).toEqual({
            product_id: 9,
            product_image_url: 'http://localhost:3000/images/products/k2.webp'
        });
    });

    test('does not mutate the input row', () => {
        const row = { product_id: 5, product_image: 'products/k3.webp' };

        attachImageUrls(row);

        expect(row.product_image).toBe('products/k3.webp');
        expect(row.product_image_url).toBeUndefined();
    });

    test('returns null for null input and [] for empty arrays', () => {
        expect(attachImageUrls(null)).toBeNull();
        expect(attachImageUrls([])).toEqual([]);
    });
});
