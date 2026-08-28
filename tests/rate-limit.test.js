import { describe, expect, test } from '@jest/globals';
import { globalLimiter, checkoutLimiter, uploadLimiter } from '../src/middleware/rateLimit.js';

describe('rate limit middlewares', () => {
    test('defines globalLimiter, checkoutLimiter, and uploadLimiter as middleware functions', () => {
        expect(typeof globalLimiter).toBe('function');
        expect(typeof checkoutLimiter).toBe('function');
        expect(typeof uploadLimiter).toBe('function');
    });
});
