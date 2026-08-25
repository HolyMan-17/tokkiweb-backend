import { describe, expect, test } from '@jest/globals';
import { normalizeAndValidatePhone, normalizeAndValidateCedula } from '../src/utils/validate.js';

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

describe('normalizeAndValidateCedula', () => {
    describe('canonical forms', () => {
        test('passes a canonical V cedula through unchanged', () => {
            expect(normalizeAndValidateCedula('V-12345678')).toBe('V-12345678');
        });

        test('passes a canonical E cedula through unchanged', () => {
            expect(normalizeAndValidateCedula('E-98765432')).toBe('E-98765432');
        });

        test('accepts a 6-digit canonical cedula', () => {
            expect(normalizeAndValidateCedula('V-123456')).toBe('V-123456');
        });
    });

    describe('normalization', () => {
        test('accepts a lowercase cedula and normalizes it', () => {
            expect(normalizeAndValidateCedula('v-12345678')).toBe('V-12345678');
            expect(normalizeAndValidateCedula('e-87654321')).toBe('E-87654321');
        });

        test('normalizes a cedula without the hyphen', () => {
            expect(normalizeAndValidateCedula('V12345678')).toBe('V-12345678');
        });

        test('strips surrounding whitespace and internal spaces', () => {
            expect(normalizeAndValidateCedula(' v - 12 345 678 ')).toBe('V-12345678');
        });
    });

    describe('rejections', () => {
        test('rejects an empty string', () => {
            expect(normalizeAndValidateCedula('')).toBeNull();
        });

        test('rejects a whitespace-only string', () => {
            expect(normalizeAndValidateCedula('   ')).toBeNull();
        });

        test('rejects a letter other than V or E', () => {
            expect(normalizeAndValidateCedula('X-12345678')).toBeNull();
        });

        test('rejects a cedula with too few digits', () => {
            expect(normalizeAndValidateCedula('V-12345')).toBeNull();
        });

        test('rejects a cedula with too many digits', () => {
            expect(normalizeAndValidateCedula('V-123456789')).toBeNull();
        });

        test('rejects embedded letters or garbage', () => {
            expect(normalizeAndValidateCedula('V-12a34567')).toBeNull();
        });

        test('rejects non-string inputs', () => {
            expect(normalizeAndValidateCedula(12345678)).toBeNull();
            expect(normalizeAndValidateCedula(undefined)).toBeNull();
            expect(normalizeAndValidateCedula(null)).toBeNull();
        });
    });
});
