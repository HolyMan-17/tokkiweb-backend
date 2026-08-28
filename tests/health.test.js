import { describe, expect, test, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../src/app.js';
import { endPool } from '../src/config/db.js';

afterAll(async () => {
    await endPool();
});

describe('GET /health endpoint', () => {
    test('returns 200 and ok status with database state', async () => {
        const res = await request(app).get('/health');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body.database).toBe('connected');
        expect(typeof res.body.uptime).toBe('number');
        expect(res.body.timestamp).toBeDefined();
    });
});
