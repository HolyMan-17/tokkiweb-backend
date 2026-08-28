import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { clerkMiddleware } from '@clerk/express';
import { resolveUploadDir } from './utils/storage.js';
import * as db from './config/db.js';
import { globalLimiter } from './middleware/rateLimit.js';
import apiRouter from './routes/index.js';

const app = express();

app.set('trust proxy', 1);

app.use(
    helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        contentSecurityPolicy: false
    })
);
app.disable('x-powered-by');

app.get('/health', async (req, res) => {
    try {
        const dbRes = await db.query('SELECT 1');
        return res.status(200).json({
            status: 'ok',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            database: dbRes.rows.length > 0 ? 'connected' : 'disconnected'
        });
    } catch (err) {
        return res.status(503).json({
            status: 'error',
            message: 'Database unreachable',
            timestamp: new Date().toISOString()
        });
    }
});

const allowedOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            return callback(new Error('Blocked by CORS policy'));
        },
        methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
        maxAge: 86400
    })
);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use('/images', express.static(resolveUploadDir(), { maxAge: '7d', immutable: true }));
app.use(clerkMiddleware());
app.use('/api', globalLimiter, apiRouter);

app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((err, req, res, next) => {
    console.error(err.stack);

    let status = err.status || 500;
    let message = 'Internal server error.';

    switch (err.code) {
        case '22P02':
            status = 400;
            message = 'Invalid ID format.';
            break;
        case '23505':
            status = 409;
            message = 'Resource already exists.';
            break;
        case '23503':
            status = 400;
            message = 'Related resource does not exist.';
            break;
    }

    res.status(status).json({ success: false, message });
});

export default app