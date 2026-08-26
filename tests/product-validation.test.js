import { describe, expect, test } from '@jest/globals';
import {
    validateProductCreate,
    validateProductPatch,
    validateOrderItems
} from '../src/utils/productValidation.js';

const validCreate = {
    product_name: 'Labial Rojo',
    product_price: 12.5,
    product_description: 'Long-lasting red lipstick',
    category: 'Maquillaje',
    qty_available: 10
};

describe('validateProductCreate', () => {
    test('accepts a fully valid payload', () => {
        expect(validateProductCreate(validCreate)).toEqual({ ok: true });
    });

    test('rejects non-object bodies', () => {
        expect(validateProductCreate(null).ok).toBe(false);
        expect(validateProductCreate('nope').ok).toBe(false);
        expect(validateProductCreate(undefined).ok).toBe(false);
    });

    test('rejects missing fields', () => {
        for (const key of ['product_name', 'product_price', 'product_description', 'qty_available']) {
            const body = { ...validCreate };
            delete body[key];
            expect(validateProductCreate(body).ok).toBe(false);
        }
    });

    test('rejects empty or non-string names', () => {
        expect(validateProductCreate({ ...validCreate, product_name: '   ' }).ok).toBe(false);
        expect(validateProductCreate({ ...validCreate, product_name: 42 }).ok).toBe(false);
    });

    test('rejects zero, negative and non-numeric prices', () => {
        expect(validateProductCreate({ ...validCreate, product_price: 0 }).ok).toBe(false);
        expect(validateProductCreate({ ...validCreate, product_price: -3 }).ok).toBe(false);
        expect(validateProductCreate({ ...validCreate, product_price: '19.99' }).ok).toBe(false);
        expect(validateProductCreate({ ...validCreate, product_price: NaN }).ok).toBe(false);
        expect(validateProductCreate({ ...validCreate, product_price: Infinity }).ok).toBe(false);
    });

    test('rejects non-integer or negative quantities', () => {
        expect(validateProductCreate({ ...validCreate, qty_available: 2.5 }).ok).toBe(false);
        expect(validateProductCreate({ ...validCreate, qty_available: -1 }).ok).toBe(false);
        expect(validateProductCreate({ ...validCreate, qty_available: '10' }).ok).toBe(false);
        expect(validateProductCreate({ ...validCreate, qty_available: 0 })).toEqual({ ok: true });
    });

    test('rejects invalid categories like the controller used to', () => {
        expect(validateProductCreate({ ...validCreate, category: '' }).ok).toBe(false);
        expect(validateProductCreate({ ...validCreate, category: 7 }).ok).toBe(false);
        expect(validateProductCreate({ ...validCreate, category: 'x'.repeat(101) }).ok).toBe(false);
    });

    test('error results carry a message string', () => {
        const r = validateProductCreate({ ...validCreate, product_price: -1 });
        expect(typeof r.message).toBe('string');
        expect(r.message.length).toBeGreaterThan(0);
    });
});

describe('validateProductPatch', () => {
    test('accepts an empty object (controller enforces at-least-one itself)', () => {
        expect(validateProductPatch({})).toEqual({ ok: true });
    });

    test('accepts valid partial updates', () => {
        expect(validateProductPatch({ product_price: 9.99 })).toEqual({ ok: true });
        expect(validateProductPatch({ qty_available: 0 })).toEqual({ ok: true });
        expect(validateProductPatch({ product_name: 'Nuevo', category: 'Ropa' })).toEqual({ ok: true });
    });

    test('rejects bad types on provided fields only', () => {
        expect(validateProductPatch({ product_price: 'free' }).ok).toBe(false);
        expect(validateProductPatch({ qty_available: 1.5 }).ok).toBe(false);
        expect(validateProductPatch({ qty_available: -2 }).ok).toBe(false);
        expect(validateProductPatch({ product_name: '' }).ok).toBe(false);
        expect(validateProductPatch({ product_description: 123 }).ok).toBe(false);
        expect(validateProductPatch({ category: 'x'.repeat(101) }).ok).toBe(false);
    });
});

describe('validateOrderItems', () => {
    test('accepts valid item lists', () => {
        expect(validateOrderItems([{ product_id: 1, product_qty: 2 }])).toEqual({ ok: true });
        expect(validateOrderItems([
            { product_id: 1, product_qty: 1 },
            { product_id: 999, product_qty: 3 }
        ])).toEqual({ ok: true });
    });

    test('rejects non-array or empty inputs', () => {
        expect(validateOrderItems('two items').ok).toBe(false);
        expect(validateOrderItems([]).ok).toBe(false);
        expect(validateOrderItems(null).ok).toBe(false);
    });

    test('rejects malformed entries', () => {
        expect(validateOrderItems([{ product_id: 1 }]).ok).toBe(false);
        expect(validateOrderItems([{ product_qty: 1 }]).ok).toBe(false);
        expect(validateOrderItems([{ product_id: 'abc', product_qty: 1 }]).ok).toBe(false);
        expect(validateOrderItems([{ product_id: 1.5, product_qty: 1 }]).ok).toBe(false);
        expect(validateOrderItems([{ product_id: 1, product_qty: 0 }]).ok).toBe(false);
        expect(validateOrderItems([{ product_id: 1, product_qty: -1 }]).ok).toBe(false);
        expect(validateOrderItems([{ product_id: 1, product_qty: '2' }]).ok).toBe(false);
        expect(validateOrderItems([null]).ok).toBe(false);
    });
});
