import { describe, expect, test, afterAll } from '@jest/globals';
import {
    addProductImage,
    removeProductImageByUrl,
    replaceCoverImage,
    clearCoverImage,
    reorderProductImages
} from '../src/controllers/c_products.js';
import { endPool } from '../src/config/db.js';

afterAll(async () => {
    await endPool();
});

describe('addProductImage', () => {
    const productId = 7;
    const buffer = Buffer.from('image-bytes');

    const makeAddDeps = ({ state = { exists: true, is_archived: false, image_count: 2 }, persistResult = true } = {}) => {
        const calls = [];
        return {
            calls,
            deps: {
                loadProductState: async () => {
                    calls.push('load');
                    return state;
                },
                saveFile: async (buf) => {
                    calls.push(`save:${buf.toString()}`);
                    return 'products/33333333-3333-4333-8333-333333333333.webp';
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

    test('appends the image into the next free slot and reports the new key', async () => {
        const { deps, calls } = makeAddDeps({ state: { exists: true, is_archived: false, image_count: 2 } });

        const result = await addProductImage(deps, productId, buffer);

        expect(result).toEqual({ ok: true, imageKey: 'products/33333333-3333-4333-8333-333333333333.webp' });
        expect(calls).toEqual([
            'load',
            'save:image-bytes',
            'persist:products/33333333-3333-4333-8333-333333333333.webp'
        ]);
    });

    test('rejects with 409 before touching storage when the product already has 5 images', async () => {
        const { deps, calls } = makeAddDeps({ state: { exists: true, is_archived: false, image_count: 5 } });

        const result = await addProductImage(deps, productId, buffer);

        expect(result).toEqual({
            status: 409,
            message: 'This product already has the maximum of 5 images.'
        });
        expect(calls).toEqual(['load']);
    });

    test('returns 404 "not found" without touching storage or db writes', async () => {
        const { deps, calls } = makeAddDeps({ state: { exists: false } });

        const result = await addProductImage(deps, productId, buffer);

        expect(result).toEqual({ status: 404, message: 'Product was not found.' });
        expect(calls).toEqual(['load']);
    });

    test('returns 404 "archived" without touching storage or db writes', async () => {
        const { deps, calls } = makeAddDeps({ state: { exists: true, is_archived: true, image_count: 1 } });

        const result = await addProductImage(deps, productId, buffer);

        expect(result).toEqual({ status: 404, message: 'Product is archived.' });
        expect(calls).toEqual(['load']);
    });

    test('returns 400 with the payload message when saving fails, cleaning nothing', async () => {
        const { deps, calls } = makeAddDeps();
        deps.saveFile = async () => {
            calls.push('save-failed');
            throw new Error('Invalid image payload.');
        };

        const result = await addProductImage(deps, productId, buffer);

        expect(result).toEqual({ status: 400, message: 'Invalid image payload.' });
        expect(calls).toEqual(['load', 'save-failed']);
    });

    test('cleans up the new file when persisting throws, and forwards the error', async () => {
        const { deps, calls } = makeAddDeps();
        deps.persistKey = async (_id, key) => {
            calls.push(`persist:${key}`);
            throw new Error('db exploded');
        };

        const result = await addProductImage(deps, productId, buffer);

        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe('db exploded');
        expect(calls).toEqual([
            'load',
            'save:image-bytes',
            'persist:products/33333333-3333-4333-8333-333333333333.webp',
            'remove:products/33333333-3333-4333-8333-333333333333.webp'
        ]);
    });

    test('maps a unique-violation race to a 409 limit response and cleans up the new file', async () => {
        const { deps, calls } = makeAddDeps();
        const raceError = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
        deps.persistKey = async (_id, key) => {
            calls.push(`persist:${key}`);
            throw raceError;
        };

        const result = await addProductImage(deps, productId, buffer);

        expect(result).toEqual({
            status: 409,
            message: 'This product already has the maximum of 5 images.'
        });
        expect(calls).toEqual([
            'load',
            'save:image-bytes',
            'persist:products/33333333-3333-4333-8333-333333333333.webp',
            'remove:products/33333333-3333-4333-8333-333333333333.webp'
        ]);
    });

    test('cleans up the new file and returns 404 archived when the product disappears mid-flight', async () => {
        const { deps, calls } = makeAddDeps({ persistResult: false });

        const result = await addProductImage(deps, productId, buffer);

        expect(result).toEqual({ status: 404, message: 'Product is archived.' });
        expect(calls).toEqual([
            'load',
            'save:image-bytes',
            'persist:products/33333333-3333-4333-8333-333333333333.webp',
            'remove:products/33333333-3333-4333-8333-333333333333.webp'
        ]);
    });
});

describe('removeProductImageByUrl', () => {
    const productId = 9;
    const ABSOLUTE_URL = 'http://localhost:3000/images/products/11111111-1111-4111-8111-111111111111.webp';
    const RELATIVE_URL = '/images/products/11111111-1111-4111-8111-111111111111.webp';

    const makeRemoveDeps = ({
        state = { exists: true, is_archived: false },
        galleryKeys = ['products/11111111-1111-4111-8111-111111111111.webp', 'products/22222222-2222-4222-8222-222222222222.webp'],
        persistResult = true
    } = {}) => {
        const calls = [];
        return {
            calls,
            deps: {
                loadProductState: async () => {
                    calls.push('load');
                    return state;
                },
                loadGalleryKeys: async () => {
                    calls.push('gallery');
                    return galleryKeys;
                },
                persistRemove: async (_productId, key) => {
                    calls.push(`persist:remove:${key}`);
                    return persistResult;
                },
                removeFile: async (key) => {
                    calls.push(`remove:${key}`);
                    return true;
                }
            }
        };
    };

    test('resolves the key from an absolute URL, removes the row and deletes the file after commit', async () => {
        const { deps, calls } = makeRemoveDeps();

        const result = await removeProductImageByUrl(deps, productId, ABSOLUTE_URL);

        expect(result).toEqual({ ok: true, imageKey: 'products/11111111-1111-4111-8111-111111111111.webp' });
        expect(calls).toEqual([
            'load',
            'gallery',
            'persist:remove:products/11111111-1111-4111-8111-111111111111.webp',
            'remove:products/11111111-1111-4111-8111-111111111111.webp'
        ]);
    });

    test('accepts relative /images/ URLs', async () => {
        const { deps, calls } = makeRemoveDeps();

        const result = await removeProductImageByUrl(deps, productId, RELATIVE_URL);

        expect(result.ok).toBe(true);
        expect(calls).toEqual([
            'load',
            'gallery',
            'persist:remove:products/11111111-1111-4111-8111-111111111111.webp',
            'remove:products/11111111-1111-4111-8111-111111111111.webp'
        ]);
    });

    test('rejects a URL that does not point at a product image without touching the database', async () => {
        const { deps, calls } = makeRemoveDeps();

        const result = await removeProductImageByUrl(deps, productId, 'http://evil.com/whatever');

        expect(result).toEqual({ status: 400, message: 'Unknown image URL.' });
        expect(calls).toEqual([]);
    });

    test('returns 404 "not found" without touching db writes or storage', async () => {
        const { deps, calls } = makeRemoveDeps({ state: { exists: false } });

        const result = await removeProductImageByUrl(deps, productId, ABSOLUTE_URL);

        expect(result).toEqual({ status: 404, message: 'Product was not found.' });
        expect(calls).toEqual(['load']);
    });

    test('returns 404 "archived" without touching db writes or storage', async () => {
        const { deps, calls } = makeRemoveDeps({ state: { exists: true, is_archived: true } });

        const result = await removeProductImageByUrl(deps, productId, ABSOLUTE_URL);

        expect(result).toEqual({ status: 404, message: 'Product is archived.' });
        expect(calls).toEqual(['load']);
    });

    test('returns 404 when the image key is not part of the product gallery', async () => {
        const { deps, calls } = makeRemoveDeps({ galleryKeys: ['products/22222222-2222-4222-8222-222222222222.webp'] });

        const result = await removeProductImageByUrl(deps, productId, ABSOLUTE_URL);

        expect(result).toEqual({ status: 404, message: 'Image was not found.' });
        expect(calls).toEqual(['load', 'gallery']);
    });

    test('never removes the file when the delete fails', async () => {
        const { deps, calls } = makeRemoveDeps();
        deps.persistRemove = async (_id, key) => {
            calls.push(`persist:remove:${key}`);
            throw new Error('db exploded');
        };

        const result = await removeProductImageByUrl(deps, productId, ABSOLUTE_URL);

        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe('db exploded');
        expect(calls).toEqual([
            'load',
            'gallery',
            'persist:remove:products/11111111-1111-4111-8111-111111111111.webp'
        ]);
    });

    test('returns 404 archived and keeps the file when the product disappears mid-flight', async () => {
        const { deps, calls } = makeRemoveDeps({ persistResult: false });

        const result = await removeProductImageByUrl(deps, productId, ABSOLUTE_URL);

        expect(result).toEqual({ status: 404, message: 'Product is archived.' });
        expect(calls).toEqual([
            'load',
            'gallery',
            'persist:remove:products/11111111-1111-4111-8111-111111111111.webp'
        ]);
    });
});

describe('replaceCoverImage (legacy POST /:id/image)', () => {
    const productId = 11;
    const buffer = Buffer.from('image-bytes');

    const makeReplaceDeps = ({
        state = { exists: true, is_archived: false, cover_key: 'products/44444444-4444-4444-8444-444444444444.webp' },
        persistResult = true
    } = {}) => {
        const calls = [];
        return {
            calls,
            deps: {
                loadProductState: async () => {
                    calls.push('load');
                    return state;
                },
                saveFile: async (buf) => {
                    calls.push(`save:${buf.toString()}`);
                    return 'products/33333333-3333-4333-8333-333333333333.webp';
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

    test('overwrites the cover key and removes the old file after a successful persist', async () => {
        const { deps, calls } = makeReplaceDeps();

        const result = await replaceCoverImage(deps, productId, buffer);

        expect(result).toEqual({ ok: true, imageKey: 'products/33333333-3333-4333-8333-333333333333.webp' });
        expect(calls).toEqual([
            'load',
            'save:image-bytes',
            'persist:products/33333333-3333-4333-8333-333333333333.webp',
            'remove:products/44444444-4444-4444-8444-444444444444.webp'
        ]);
    });

    test('inserts a cover when the gallery is empty and removes nothing', async () => {
        const { deps, calls } = makeReplaceDeps({ state: { exists: true, is_archived: false, cover_key: null } });

        const result = await replaceCoverImage(deps, productId, buffer);

        expect(result).toEqual({ ok: true, imageKey: 'products/33333333-3333-4333-8333-333333333333.webp' });
        expect(calls).toEqual([
            'load',
            'save:image-bytes',
            'persist:products/33333333-3333-4333-8333-333333333333.webp'
        ]);
    });

    test('returns 404 "not found" without touching storage or db writes', async () => {
        const { deps, calls } = makeReplaceDeps({ state: { exists: false } });

        const result = await replaceCoverImage(deps, productId, buffer);

        expect(result).toEqual({ status: 404, message: 'Product was not found.' });
        expect(calls).toEqual(['load']);
    });

    test('returns 404 "archived" without touching storage or db writes', async () => {
        const { deps, calls } = makeReplaceDeps({ state: { exists: true, is_archived: true, cover_key: 'products/44444444-4444-4444-8444-444444444444.webp' } });

        const result = await replaceCoverImage(deps, productId, buffer);

        expect(result).toEqual({ status: 404, message: 'Product is archived.' });
        expect(calls).toEqual(['load']);
    });

    test('returns 400 with the payload message when saving fails, cleaning nothing', async () => {
        const { deps, calls } = makeReplaceDeps();
        deps.saveFile = async () => {
            calls.push('save-failed');
            throw new Error('Invalid image payload.');
        };

        const result = await replaceCoverImage(deps, productId, buffer);

        expect(result).toEqual({ status: 400, message: 'Invalid image payload.' });
        expect(calls).toEqual(['load', 'save-failed']);
    });

    test('cleans up the new file when persisting throws, and forwards the error', async () => {
        const { deps, calls } = makeReplaceDeps();
        deps.persistKey = async (_id, key) => {
            calls.push(`persist:${key}`);
            throw new Error('db exploded');
        };

        const result = await replaceCoverImage(deps, productId, buffer);

        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe('db exploded');
        expect(calls).toEqual([
            'load',
            'save:image-bytes',
            'persist:products/33333333-3333-4333-8333-333333333333.webp',
            'remove:products/33333333-3333-4333-8333-333333333333.webp'
        ]);
    });

    test('cleans up the new file and returns 404 archived when the product disappears mid-flight', async () => {
        const { deps, calls } = makeReplaceDeps({ persistResult: false });

        const result = await replaceCoverImage(deps, productId, buffer);

        expect(result).toEqual({ status: 404, message: 'Product is archived.' });
        expect(calls).toEqual([
            'load',
            'save:image-bytes',
            'persist:products/33333333-3333-4333-8333-333333333333.webp',
            'remove:products/33333333-3333-4333-8333-333333333333.webp'
        ]);
    });
});

describe('clearCoverImage (legacy DELETE /:id/image)', () => {
    const productId = 15;

    const makeClearDeps = ({
        state = { exists: true, is_archived: false },
        galleryKeys = ['products/11111111-1111-4111-8111-111111111111.webp', 'products/22222222-2222-4222-8222-222222222222.webp'],
        persistResult = true
    } = {}) => {
        const calls = [];
        return {
            calls,
            deps: {
                loadProductState: async () => {
                    calls.push('load');
                    return state;
                },
                loadGalleryKeys: async () => {
                    calls.push('gallery');
                    return galleryKeys;
                },
                persistRemove: async (_productId, key) => {
                    calls.push(`persist:remove:${key}`);
                    return persistResult;
                },
                removeFile: async (key) => {
                    calls.push(`remove:${key}`);
                    return true;
                }
            }
        };
    };

    test('removes the cover row and deletes its file after commit', async () => {
        const { deps, calls } = makeClearDeps();

        const result = await clearCoverImage(deps, productId);

        expect(result).toEqual({ ok: true });
        expect(calls).toEqual([
            'load',
            'gallery',
            'persist:remove:products/11111111-1111-4111-8111-111111111111.webp',
            'remove:products/11111111-1111-4111-8111-111111111111.webp'
        ]);
    });

    test('is a no-op success when the gallery is empty', async () => {
        const { deps, calls } = makeClearDeps({ galleryKeys: [] });

        const result = await clearCoverImage(deps, productId);

        expect(result).toEqual({ ok: true });
        expect(calls).toEqual(['load', 'gallery']);
    });

    test('returns 404 "not found" without touching db writes or storage', async () => {
        const { deps, calls } = makeClearDeps({ state: { exists: false } });

        const result = await clearCoverImage(deps, productId);

        expect(result).toEqual({ status: 404, message: 'Product was not found.' });
        expect(calls).toEqual(['load']);
    });

    test('returns 404 "archived" without touching db writes or storage', async () => {
        const { deps, calls } = makeClearDeps({ state: { exists: true, is_archived: true } });

        const result = await clearCoverImage(deps, productId);

        expect(result).toEqual({ status: 404, message: 'Product is archived.' });
        expect(calls).toEqual(['load']);
    });

    test('forwards persist errors and never removes the file when the delete fails', async () => {
        const { deps, calls } = makeClearDeps();
        deps.persistRemove = async (_id, key) => {
            calls.push(`persist:remove:${key}`);
            throw new Error('db exploded');
        };

        const result = await clearCoverImage(deps, productId);

        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe('db exploded');
        expect(calls).toEqual(['load', 'gallery', 'persist:remove:products/11111111-1111-4111-8111-111111111111.webp']);
    });

    test('returns 404 archived and keeps the file when the product disappears mid-flight', async () => {
        const { deps, calls } = makeClearDeps({ persistResult: false });

        const result = await clearCoverImage(deps, productId);

        expect(result).toEqual({ status: 404, message: 'Product is archived.' });
        expect(calls).toEqual(['load', 'gallery', 'persist:remove:products/11111111-1111-4111-8111-111111111111.webp']);
    });
});

describe('reorderProductImages', () => {
    const productId = 13;
    const URL_A = 'http://localhost:3000/images/products/11111111-1111-4111-8111-111111111111.webp';
    const URL_B = 'http://localhost:3000/images/products/22222222-2222-4222-8222-222222222222.webp';

    const makeReorderDeps = ({
        state = { exists: true, is_archived: false },
        galleryKeys = ['products/11111111-1111-4111-8111-111111111111.webp', 'products/22222222-2222-4222-8222-222222222222.webp'],
        persistResult = true
    } = {}) => {
        const calls = [];
        return {
            calls,
            deps: {
                loadProductState: async () => {
                    calls.push('load');
                    return state;
                },
                loadGalleryKeys: async () => {
                    calls.push('gallery');
                    return galleryKeys;
                },
                persistReorder: async (_productId, keys) => {
                    calls.push(`persist:reorder:${keys.join('|')}`);
                    return persistResult;
                }
            }
        };
    };

    test('persists the new order for a valid full set', async () => {
        const { deps, calls } = makeReorderDeps();

        const result = await reorderProductImages(deps, productId, [URL_B, URL_A]);

        expect(result).toEqual({ ok: true });
        expect(calls).toEqual([
            'load',
            'gallery',
            'persist:reorder:products/22222222-2222-4222-8222-222222222222.webp|products/11111111-1111-4111-8111-111111111111.webp'
        ]);
    });

    test('rejects a URL outside the gallery pattern without touching the database', async () => {
        const { deps, calls } = makeReorderDeps();

        const result = await reorderProductImages(deps, productId, ['http://evil.com/x', URL_A]);

        expect(result).toEqual({ status: 400, message: 'Unknown image URL.' });
        expect(calls).toEqual([]);
    });

    test('rejects an order that does not contain every gallery image exactly once', async () => {
        const { deps, calls } = makeReorderDeps();

        const result = await reorderProductImages(deps, productId, [URL_A]);

        expect(result).toEqual({ status: 400, message: 'Invalid image order.' });
        expect(calls).toEqual(['load', 'gallery']);
    });

    test('rejects duplicate entries in the order payload', async () => {
        const { deps, calls } = makeReorderDeps();

        const result = await reorderProductImages(deps, productId, [URL_A, URL_A]);

        expect(result).toEqual({ status: 400, message: 'Invalid image order.' });
        expect(calls).toEqual(['load', 'gallery']);
    });

    test('returns 404 "not found" without touching db writes', async () => {
        const { deps, calls } = makeReorderDeps({ state: { exists: false } });

        const result = await reorderProductImages(deps, productId, [URL_A, URL_B]);

        expect(result).toEqual({ status: 404, message: 'Product was not found.' });
        expect(calls).toEqual(['load']);
    });

    test('returns 404 "archived" without touching db writes', async () => {
        const { deps, calls } = makeReorderDeps({ state: { exists: true, is_archived: true } });

        const result = await reorderProductImages(deps, productId, [URL_A, URL_B]);

        expect(result).toEqual({ status: 404, message: 'Product is archived.' });
        expect(calls).toEqual(['load']);
    });

    test('forwards persist errors', async () => {
        const { deps, calls } = makeReorderDeps();
        deps.persistReorder = async (_id, keys) => {
            calls.push(`persist:reorder:${keys.join('|')}`);
            throw new Error('db exploded');
        };

        const result = await reorderProductImages(deps, productId, [URL_B, URL_A]);

        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe('db exploded');
        expect(calls).toEqual([
            'load',
            'gallery',
            'persist:reorder:products/22222222-2222-4222-8222-222222222222.webp|products/11111111-1111-4111-8111-111111111111.webp'
        ]);
    });
});
