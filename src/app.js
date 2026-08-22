import express from 'express';
import cors from 'cors';
import { clerkMiddleware } from '@clerk/express';
import * as db from './config/db.js';
import apiRouter from './routes/index.js';

const app = express();

const allowedOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));  // Allows your React frontend to connect to this API
app.use(express.json());              // Allows your server to read JSON sent in request bodies
app.use(express.urlencoded({ extended: true })); // Parses URL-encoded form data
app.use(clerkMiddleware());
app.use('/api', apiRouter);

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