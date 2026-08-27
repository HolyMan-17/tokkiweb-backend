import { parseIdParam, parseUuidParam } from '../src/utils/params.js';

describe('parseIdParam', () => {
    test('accepts a positive integer string and returns a number', () => {
        expect(parseIdParam('5')).toBe(5);
        expect(parseIdParam('42')).toBe(42);
    });

    test('trims surrounding whitespace', () => {
        expect(parseIdParam(' 7 ')).toBe(7);
    });

    test('rejects non-numeric strings', () => {
        expect(parseIdParam('abc')).toBeNull();
        expect(parseIdParam('12abc')).toBeNull();
        expect(parseIdParam('1.5')).toBeNull();
    });

    test('rejects empty, null, and undefined input', () => {
        expect(parseIdParam('')).toBeNull();
        expect(parseIdParam('   ')).toBeNull();
        expect(parseIdParam(null)).toBeNull();
        expect(parseIdParam(undefined)).toBeNull();
    });

    test('rejects zero and negatives', () => {
        expect(parseIdParam('0')).toBeNull();
        expect(parseIdParam('-3')).toBeNull();
    });

    test('rejects numbers beyond the safe integer range', () => {
        expect(parseIdParam('99999999999999999999')).toBeNull();
    });
});

describe('parseUuidParam', () => {
    test('accepts a valid UUID string and returns lowercase canonical form', () => {
        const uuid = '550e8400-e29b-41d4-a716-446655440000';
        expect(parseUuidParam(uuid)).toBe(uuid);
        expect(parseUuidParam('550E8400-E29B-41D4-A716-446655440000')).toBe(uuid);
    });

    test('trims surrounding whitespace on valid UUID', () => {
        expect(parseUuidParam('  550e8400-e29b-41d4-a716-446655440000  ')).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    test('rejects invalid UUID strings', () => {
        expect(parseUuidParam('not-a-uuid')).toBeNull();
        expect(parseUuidParam('550e8400-e29b-41d4-a716-44665544000')).toBeNull(); // 1 char short
        expect(parseUuidParam('550e8400-e29b-41d4-a716-4466554400000')).toBeNull(); // 1 char too long
        expect(parseUuidParam('550e8400-e29b-41d4-a716-44665544000z')).toBeNull(); // non-hex
    });

    test('rejects empty, null, and non-string inputs', () => {
        expect(parseUuidParam('')).toBeNull();
        expect(parseUuidParam('   ')).toBeNull();
        expect(parseUuidParam(null)).toBeNull();
        expect(parseUuidParam(undefined)).toBeNull();
        expect(parseUuidParam(12345)).toBeNull();
    });
});

