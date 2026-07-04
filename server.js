import dotenv from 'dotenv';
import app from './src/app.js';
import * as db from './src/config/db.js';

// Load environment variables from .env
dotenv.config();

const PORT = process.env.PORT || 3000;

// Optional: Verify PostgreSQL connection on startup
db.query('SELECT NOW()')
    .then((res) => {
    console.log('✅ Database connected successfully. Server time:', res.rows[0].now);

// Start listening on the port only after database verification
app.listen(PORT, () => {
    console.log(`🚀 Server is running at http://localhost:${PORT}`);
    });
})
    .catch((err) => {
    console.error('❌ Database connection failed. Server shutting down...', err.stack);
    process.exit(1);
});