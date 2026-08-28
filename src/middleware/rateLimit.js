import rateLimit from 'express-rate-limit';

// Global API Limiter: 150 requests per 15 minutes per IP
export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 150,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' }
});

// Checkout Limiter: 10 orders per 15 minutes per IP (prevents inventory locking spam)
export const checkoutLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many checkout attempts. Please try again shortly.' }
});

// Upload Limiter: 30 image uploads per 15 minutes per admin IP
export const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Upload limit reached. Please wait before uploading more images.' }
});
