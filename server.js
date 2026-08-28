import dotenv from 'dotenv';
import app from './src/app.js';
import * as db from './src/config/db.js';

// Load environment variables from .env
dotenv.config();

const PORT = process.env.PORT || 3000;

let server;

db.query('SELECT NOW()')
    .then((res) => {
        console.log('Database connected successfully. Server time:', res.rows[0].now);

        server = app.listen(PORT, () => {
            console.log(`Server running on port ${PORT} [NODE_ENV=${process.env.NODE_ENV || 'development'}]`);
        });
    })
    .catch((err) => {
        console.error('Database connection failed. Server shutting down...', err.stack);
        process.exit(1);
    });

const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
    if (server) {
        server.close(async () => {
            console.log('HTTP server closed.');
            try {
                await db.endPool();
                console.log('Database pool drained.');
                process.exit(0);
            } catch (err) {
                console.error('Error closing database pool:', err);
                process.exit(1);
            }
        });
    } else {
        process.exit(0);
    }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});