import { describe, expect, test, jest, beforeEach, afterEach, afterAll } from '@jest/globals';
import { parseTopProductsQuery, fetchTopProducts } from '../src/utils/topProducts.js';
import { createAnalyticsController } from '../src/controllers/c_analytics.js';
import { endPool } from '../src/config/db.js';

afterAll(async () => {
    await endPool();
});

describe('parseTopProductsQuery', () => {
    test('returns defaults when query params are omitted or empty strings', () => {
        expect(parseTopProductsQuery({})).toEqual({
            ok: true,
            sort: 'units',
            period: 'all',
            limit: 5
        });

        expect(parseTopProductsQuery({ sort: '', period: '', limit: '' })).toEqual({
            ok: true,
            sort: 'units',
            period: 'all',
            limit: 5
        });
    });

    test('accepts valid values and trims whitespace', () => {
        expect(parseTopProductsQuery({ sort: ' revenue ', period: ' 30d ', limit: ' 10 ' })).toEqual({
            ok: true,
            sort: 'revenue',
            period: '30d',
            limit: 10
        });

        expect(parseTopProductsQuery({ sort: 'units', period: '7d', limit: '1' })).toEqual({
            ok: true,
            sort: 'units',
            period: '7d',
            limit: 1
        });

        expect(parseTopProductsQuery({ sort: 'units', period: '90d', limit: '20' })).toEqual({
            ok: true,
            sort: 'units',
            period: '90d',
            limit: 20
        });
    });

    test('rejects invalid sort values', () => {
        expect(parseTopProductsQuery({ sort: 'price' })).toEqual({
            ok: false,
            message: 'sort must be one of: units, revenue.'
        });
        expect(parseTopProductsQuery({ sort: ['units', 'revenue'] })).toEqual({
            ok: false,
            message: 'sort must be one of: units, revenue.'
        });
    });

    test('rejects invalid period values', () => {
        expect(parseTopProductsQuery({ period: '14d' })).toEqual({
            ok: false,
            message: 'period must be one of: all, 7d, 30d, 90d.'
        });
        expect(parseTopProductsQuery({ period: 'year' })).toEqual({
            ok: false,
            message: 'period must be one of: all, 7d, 30d, 90d.'
        });
        expect(parseTopProductsQuery({ period: ['7d'] })).toEqual({
            ok: false,
            message: 'period must be one of: all, 7d, 30d, 90d.'
        });
    });

    test('rejects invalid limit values', () => {
        for (const badLimit of ['0', '-1', '21', '1.5', 'abc', ['5']]) {
            expect(parseTopProductsQuery({ limit: badLimit })).toEqual({
                ok: false,
                message: 'limit must be a whole number between 1 and 20.'
            });
        }
    });
});

describe('fetchTopProducts', () => {
    const ORIGINAL_BASE = process.env.PUBLIC_BASE_URL;

    beforeEach(() => {
        process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
    });

    afterEach(() => {
        if (ORIGINAL_BASE === undefined) {
            delete process.env.PUBLIC_BASE_URL;
        } else {
            process.env.PUBLIC_BASE_URL = ORIGINAL_BASE;
        }
    });

    test('queries approved non-archived products ordered by units_sold and maps gallery URLs and types', async () => {
        const mockDb = {
            query: jest.fn().mockResolvedValue({
                rows: [
                    {
                        product_id: 12,
                        product_name: 'Bálsamo Labial Fresa',
                        category: 'Maquillaje',
                        product_price: '5.00',
                        qty_available: '2',
                        in_stock: true,
                        image_keys: ['products/k1.webp', 'products/k2.webp'],
                        units_sold: '24',
                        orders_count: '14',
                        total_revenue: '120.00'
                    }
                ]
            })
        };

        const rows = await fetchTopProducts(mockDb);

        expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), [5]);
        const sql = mockDb.query.mock.calls[0][0];
        expect(sql).toContain("o.status = 'approved'");
        expect(sql).toContain('p.is_archived = false');
        expect(sql).toContain('ORDER BY units_sold DESC');

        expect(rows).toEqual([
            {
                product_id: 12,
                product_name: 'Bálsamo Labial Fresa',
                category: 'Maquillaje',
                product_price: '5.00',
                qty_available: 2,
                in_stock: true,
                product_image_urls: [
                    'http://localhost:3000/images/products/k1.webp',
                    'http://localhost:3000/images/products/k2.webp'
                ],
                product_image_url: 'http://localhost:3000/images/products/k1.webp',
                units_sold: 24,
                orders_count: 14,
                total_revenue: '120.00'
            }
        ]);
        expect(rows[0]).not.toHaveProperty('image_keys');
    });

    test('uses total_revenue ordering when sort is revenue', async () => {
        const mockDb = {
            query: jest.fn().mockResolvedValue({ rows: [] })
        };

        await fetchTopProducts(mockDb, { sort: 'revenue', period: 'all', limit: 3 });

        expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), [3]);
        const sql = mockDb.query.mock.calls[0][0];
        expect(sql).toContain('ORDER BY total_revenue DESC');
        expect(sql).not.toContain('o.created_at >=');
    });

    test('filters by 30d cutoff timestamp when period is 30d', async () => {
        const mockDb = {
            query: jest.fn().mockResolvedValue({ rows: [] })
        };

        await fetchTopProducts(mockDb, {
            sort: 'units',
            period: '30d',
            limit: 5,
            now: new Date('2026-11-20T12:00:00.000Z')
        });

        expect(mockDb.query).toHaveBeenCalledWith(
            expect.stringContaining('o.created_at >= $1::timestamptz'),
            ['2026-10-21T12:00:00.000Z', 5]
        );
        expect(mockDb.query.mock.calls[0][0]).toContain('ORDER BY units_sold DESC');
    });

    test('filters by 7d cutoff timestamp and revenue sort', async () => {
        const mockDb = {
            query: jest.fn().mockResolvedValue({ rows: [] })
        };

        await fetchTopProducts(mockDb, {
            sort: 'revenue',
            period: '7d',
            limit: 10,
            now: new Date('2026-11-20T12:00:00.000Z')
        });

        const sql = mockDb.query.mock.calls[0][0];
        expect(sql).toContain('o.created_at >= $1::timestamptz');
        expect(sql).toContain('ORDER BY total_revenue DESC');
        expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), ['2026-11-13T12:00:00.000Z', 10]);
    });

    test('computes exact 90d cutoff timestamp when period is 90d', async () => {
        const mockDb = {
            query: jest.fn().mockResolvedValue({ rows: [] })
        };

        await fetchTopProducts(mockDb, {
            sort: 'units',
            period: '90d',
            limit: 5,
            now: new Date('2026-11-20T12:00:00.000Z')
        });

        expect(mockDb.query).toHaveBeenCalledWith(
            expect.stringContaining('o.created_at >= $1::timestamptz'),
            ['2026-08-22T12:00:00.000Z', 5]
        );
    });

    test('returns an empty array when no rows are returned', async () => {
        const mockDb = {
            query: jest.fn().mockResolvedValue({ rows: [] })
        };

        const rows = await fetchTopProducts(mockDb);
        expect(rows).toEqual([]);
    });
});

describe('createAnalyticsController.getTopProducts', () => {
    const makeRes = () => ({
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    });

    test('returns 400 on invalid query params without touching db', async () => {
        const mockDb = { query: jest.fn() };
        const controller = createAnalyticsController({ db: mockDb });
        const res = makeRes();
        const next = jest.fn();

        await controller.getTopProducts({ query: { sort: 'invalid' } }, res, next);

        expect(mockDb.query).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            message: 'sort must be one of: units, revenue.'
        });
        expect(next).not.toHaveBeenCalled();
    });

    test('returns 200 with ranked products for valid query', async () => {
        const mockDb = {
            query: jest.fn().mockResolvedValue({
                rows: [
                    {
                        product_id: 1,
                        product_name: 'Mochi Fresa',
                        category: 'Dulces & Comida Asiatica',
                        product_price: '3.00',
                        qty_available: 8,
                        in_stock: true,
                        image_keys: [],
                        units_sold: 10,
                        orders_count: 4,
                        total_revenue: '30.00'
                    }
                ]
            })
        };
        const controller = createAnalyticsController({ db: mockDb });
        const res = makeRes();
        const next = jest.fn();

        await controller.getTopProducts({ query: { sort: 'units', period: 'all', limit: '5' } }, res, next);

        expect(mockDb.query).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: [
                {
                    product_id: 1,
                    product_name: 'Mochi Fresa',
                    category: 'Dulces & Comida Asiatica',
                    product_price: '3.00',
                    qty_available: 8,
                    in_stock: true,
                    product_image_urls: [],
                    product_image_url: null,
                    units_sold: 10,
                    orders_count: 4,
                    total_revenue: '30.00'
                }
            ]
        });
        expect(next).not.toHaveBeenCalled();
    });

    test('returns 200 with empty array when no sales match', async () => {
        const mockDb = {
            query: jest.fn().mockResolvedValue({ rows: [] })
        };
        const controller = createAnalyticsController({ db: mockDb });
        const res = makeRes();
        const next = jest.fn();

        await controller.getTopProducts({ query: {} }, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
        expect(next).not.toHaveBeenCalled();
    });

    test('forwards db errors to next(err)', async () => {
        const dbError = new Error('connection refused');
        const mockDb = {
            query: jest.fn().mockRejectedValue(dbError)
        };
        const controller = createAnalyticsController({ db: mockDb });
        const res = makeRes();
        const next = jest.fn();

        await controller.getTopProducts({ query: {} }, res, next);

        expect(next).toHaveBeenCalledWith(dbError);
        expect(res.status).not.toHaveBeenCalled();
    });
});
