import { describe, expect, test } from '@jest/globals';
import { normalizeAndValidatePhone } from '../src/utils/validate.js';

describe('normalizeAndValidatePhone', () => {
    describe('full international format', () => {
        test('accepts a valid E.164 number as-is', () => {
            expect(normalizeAndValidatePhone(undefined, '+584146996703')).toBe('+584146996703');
        });

        test('accepts a Colombian E.164 number', () => {
            expect(normalizeAndValidatePhone(undefined, '+573001234567')).toBe('+573001234567');
        });

        test('strips spaces and dashes', () => {
            expect(normalizeAndValidatePhone(undefined, '+58 414-699 6703')).toBe('+584146996703');
        });
    });

    describe('local format with country code', () => {
        test('normalizes a local number with a leading trunk zero', () => {
            expect(normalizeAndValidatePhone('+58', '04146996703')).toBe('+584146996703');
        });

        test('normalizes a local number without a leading zero', () => {
            expect(normalizeAndValidatePhone('+58', '4146996703')).toBe('+584146996703');
        });

        test('accepts a local number with formatting', () => {
            expect(normalizeAndValidatePhone('+58', '0414 699 6703')).toBe('+584146996703');
        });
    });

    describe('rejections', () => {
        test('rejects an empty string', () => {
            expect(normalizeAndValidatePhone('+58', '')).toBeNull();
        });

        test('rejects a non-string tlf_num', () => {
            expect(normalizeAndValidatePhone('+58', 4146996703)).toBeNull();
        });

        test('rejects a number that is too short', () => {
            expect(normalizeAndValidatePhone('+58', '041469')).toBeNull();
        });

        test('rejects a number that is too long', () => {
            expect(normalizeAndValidatePhone('+58', '04146999670312345')).toBeNull();
        });

        test('rejects embedded invalid characters', () => {
            expect(normalizeAndValidatePhone('+58', '0414-69-99-6703abc')).toBeNull();
        });

        test('rejects a country code without a leading plus', () => {
            expect(normalizeAndValidatePhone('58', '041469996703')).toBeNull();
        });

        test('rejects a country code starting with zero', () => {
            expect(normalizeAndValidatePhone('+058', '041469996703')).toBeNull();
        });

        test('rejects a local number when no country code is given', () => {
            expect(normalizeAndValidatePhone(undefined, '041469996703')).toBeNull();
        });

        test('rejects an international number that is too short', () => {
            expect(normalizeAndValidatePhone(undefined, '+58123')).toBeNull();
        });
    });
});
