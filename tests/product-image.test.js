import { describe, expect, test, afterAll } from '@jest/globals';
import { applyProductImage } from '../src/controllers/c_products.js';
import { endPool } from '../src/config/db.js';

afterAll(async () => {
    await endPool();
});

const makeDeps = ({ product = { exists: true, is_archived: false, current_image_key: null }, persistResult = true } = {}) => {
    const calls = [];
    return {
        calls,
        deps: {
            loadProductState: async () => {
                calls.push('load');
                return product;
            },
            saveFile: async (buffer) => {
                calls.push(`save:${buffer.toString()}`);
                return 'products/new-key.webp';
            },
            persistKey: async (_productId, key) => {
                calls.push(`persist:${key}`);
                return persistResult;
            },
            removeFile: async (key) => {
                calls.push(`remove:${key}`);
                return true;
            }
        }
    };
};

describe('applyProductImage', () => {
    const productId = 7;
    const buffer = Buffer.from('image-bytes');

    test('saves then persists and reports the new key', async () => {
        const { deps, calls } = makeDeps();

        const result = await applyProductImage(deps, productId, buffer);

        expect(result).toEqual({ ok: true, imageKey: 'products/new-key.webp' });
        expect(calls[0]).toBe('load');
        expect(calls[1]).toBe('save:image-bytes');
        expect(calls[2]).toBe('persist:products/new-key.webp');
    });

    test('replaces: removes the old file only after a successful persist', async () => {
        const { deps, calls } = makeDeps({
            product: { exists: true, is_archived: false, current_image_key: 'products/old-key.webp' }
        });

        const result = await applyProductImage(deps, productId, buffer);

        expect(result.ok).toBe(true);
        expect(calls).toEqual([
            'load',
            'save:image-bytes',
            'persist:products/new-key.webp',
            'remove:products/old-key.webp'
        ]);
    });

    test('returns 404 "not found" without touching storage or db writes', async () => {
        const { deps, calls } = makeDeps({ product: { exists: false } });

        const result = await applyProductImage(deps, productId, buffer);

        expect(result).toEqual({ status: 404, message: 'Product was not found.' });
        expect(calls).toEqual(['load']);
    });

    test('returns 404 "archived" without touching storage or db writes', async () => {
        const { deps, calls } = makeDeps({
            product: { exists: true, is_archived: true, current_image_key: 'products/old-key.webp' }
        });

        const result = await applyProductImage(deps, productId, buffer);

        expect(result).toEqual({ status: 404, message: 'Product is archived.' });
        expect(calls).toEqual(['load']);
    });

    test('cleans up the new file when persisting throws, and forwards the error', async () => {
        const { deps, calls } = makeDeps();
        deps.persistKey = async (_id, key) => {
            calls.push(`persist:${key}`);
            throw new Error('db exploded');
        };

        const result = await applyProductImage(deps, productId, buffer);

        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe('db exploded');
        expect(calls).toEqual([
            'load',
            'save:image-bytes',
            'persist:products/new-key.webp',
            'remove:products/new-key.webp'
        ]);
    });

    test('cleans up the new file and returns 404 archived when persist reports the product gone mid-flight', async () => {
        const { deps, calls } = makeDeps({ persistResult: false });

        const result = await applyProductImage(deps, productId, buffer);

        expect(result).toEqual({ status: 404, message: 'Product is archived.' });
        expect(calls).toEqual([
            'load',
            'save:image-bytes',
            'persist:products/new-key.webp',
            'remove:products/new-key.webp'
        ]);
    });

    test('returns 400 with the payload message when saving fails, cleaning nothing', async () => {
        const { deps, calls } = makeDeps();
        deps.saveFile = async () => {
            calls.push('save-failed');
            throw new Error('Invalid image payload.');
        };

        const result = await applyProductImage(deps, productId, buffer);

        expect(result).toEqual({ status: 400, message: 'Invalid image payload.' });
        expect(calls).toEqual(['load', 'save-failed']);
    });
});
