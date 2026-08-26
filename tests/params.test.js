import { describe, expect, test } from '@jest/globals';
import { parseIdParam } from '../src/utils/params.js';

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
