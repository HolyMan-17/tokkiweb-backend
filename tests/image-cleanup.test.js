import { describe, expect, test } from '@jest/globals';
import { cleanupProductImages } from '../src/utils/storage.js';

describe('cleanupProductImages', () => {
    test('removes a single key and resolves 1 when removal succeeds', async () => {
        const removed = [];

        const count = await cleanupProductImages('products/a.webp', async (key) => {
            removed.push(key);
            return true;
        });

        expect(removed).toEqual(['products/a.webp']);
        expect(count).toBe(1);
    });

    test('accepts an array and counts only successful removals', async () => {
        const removed = [];
        const removeFile = async (key) => {
            removed.push(key);
            return key !== 'products/fail.webp';
        };

        const count = await cleanupProductImages(
            ['products/ok1.webp', 'products/fail.webp', 'products/ok2.webp'],
            removeFile
        );

        expect(removed).toEqual(['products/ok1.webp', 'products/fail.webp', 'products/ok2.webp']);
        expect(count).toBe(2);
    });

    test('skips null, undefined and falsy entries without calling removeFile', async () => {
        let calls = 0;
        const removeFile = async () => {
            calls += 1;
            return true;
        };

        const count = await cleanupProductImages([null, undefined, '', false, 'products/a.webp'], removeFile);

        expect(calls).toBe(1);
        expect(count).toBe(1);
    });

    test('dedupes repeated keys so each is attempted exactly once', async () => {
        const removed = [];
        const removeFile = async (key) => {
            removed.push(key);
            return true;
        };

        const count = await cleanupProductImages(
            ['products/a.webp', 'products/b.webp', 'products/a.webp', 'products/b.webp'],
            removeFile
        );

        expect(removed).toEqual(['products/a.webp', 'products/b.webp']);
        expect(count).toBe(2);
    });

    test('never throws when removeFile rejects; errors are swallowed', async () => {
        const removeFile = async (key) => {
            if (key === 'products/boom.webp'){
                throw new Error('unlink failed');
            }
            return true;
        };

        await expect(
            cleanupProductImages(['products/boom.webp', 'products/good.webp'], removeFile)
        ).resolves.toBe(1);
    });

    test('resolves 0 for empty arrays, null or undefined input', async () => {
        let calls = 0;
        const removeFile = async () => {
            calls += 1;
            return true;
        };

        await expect(cleanupProductImages([], removeFile)).resolves.toBe(0);
        await expect(cleanupProductImages(null, removeFile)).resolves.toBe(0);
        await expect(cleanupProductImages(undefined, removeFile)).resolves.toBe(0);
        expect(calls).toBe(0);
    });
});
