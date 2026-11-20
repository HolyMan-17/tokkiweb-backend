import { attachImageUrls } from './storage.js';

const ALLOWED_SORTS = ['units', 'revenue'];
const PERIOD_DAYS = {
    '7d': 7,
    '30d': 30,
    '90d': 90
};
const ALLOWED_PERIODS = ['all', '7d', '30d', '90d'];
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const MS_PER_DAY = 86_400_000;

const QUERY_TOP_BY_UNITS_ALL = `
SELECT
    p.product_id,
    p.product_name,
    p.category,
    p.product_price,
    p.qty_available,
    p.in_stock,
    COALESCE((
        SELECT array_agg(pi.image_key ORDER BY pi.sort_order)
        FROM tokki_shop.product_images pi
        WHERE pi.product_id = p.product_id
    ), '{}') AS image_keys,
    SUM(oi.product_qty)::int AS units_sold,
    COUNT(DISTINCT oi.order_id)::int AS orders_count,
    ROUND(SUM(oi.product_qty * oi.product_price), 2) AS total_revenue
FROM tokki_shop.order_items oi
INNER JOIN tokki_shop.orders o
    ON o.order_id = oi.order_id
INNER JOIN tokki_shop.products p
    ON p.product_id = oi.product_id
WHERE o.status = 'approved'
  AND p.is_archived = false
GROUP BY
    p.product_id,
    p.product_name,
    p.category,
    p.product_price,
    p.qty_available,
    p.in_stock
ORDER BY units_sold DESC, total_revenue DESC, p.product_id ASC
LIMIT $1;
`;

const QUERY_TOP_BY_REVENUE_ALL = `
SELECT
    p.product_id,
    p.product_name,
    p.category,
    p.product_price,
    p.qty_available,
    p.in_stock,
    COALESCE((
        SELECT array_agg(pi.image_key ORDER BY pi.sort_order)
        FROM tokki_shop.product_images pi
        WHERE pi.product_id = p.product_id
    ), '{}') AS image_keys,
    SUM(oi.product_qty)::int AS units_sold,
    COUNT(DISTINCT oi.order_id)::int AS orders_count,
    ROUND(SUM(oi.product_qty * oi.product_price), 2) AS total_revenue
FROM tokki_shop.order_items oi
INNER JOIN tokki_shop.orders o
    ON o.order_id = oi.order_id
INNER JOIN tokki_shop.products p
    ON p.product_id = oi.product_id
WHERE o.status = 'approved'
  AND p.is_archived = false
GROUP BY
    p.product_id,
    p.product_name,
    p.category,
    p.product_price,
    p.qty_available,
    p.in_stock
ORDER BY total_revenue DESC, units_sold DESC, p.product_id ASC
LIMIT $1;
`;

const QUERY_TOP_BY_UNITS_SINCE = `
SELECT
    p.product_id,
    p.product_name,
    p.category,
    p.product_price,
    p.qty_available,
    p.in_stock,
    COALESCE((
        SELECT array_agg(pi.image_key ORDER BY pi.sort_order)
        FROM tokki_shop.product_images pi
        WHERE pi.product_id = p.product_id
    ), '{}') AS image_keys,
    SUM(oi.product_qty)::int AS units_sold,
    COUNT(DISTINCT oi.order_id)::int AS orders_count,
    ROUND(SUM(oi.product_qty * oi.product_price), 2) AS total_revenue
FROM tokki_shop.order_items oi
INNER JOIN tokki_shop.orders o
    ON o.order_id = oi.order_id
INNER JOIN tokki_shop.products p
    ON p.product_id = oi.product_id
WHERE o.status = 'approved'
  AND p.is_archived = false
  AND o.created_at >= $1::timestamptz
GROUP BY
    p.product_id,
    p.product_name,
    p.category,
    p.product_price,
    p.qty_available,
    p.in_stock
ORDER BY units_sold DESC, total_revenue DESC, p.product_id ASC
LIMIT $2;
`;

const QUERY_TOP_BY_REVENUE_SINCE = `
SELECT
    p.product_id,
    p.product_name,
    p.category,
    p.product_price,
    p.qty_available,
    p.in_stock,
    COALESCE((
        SELECT array_agg(pi.image_key ORDER BY pi.sort_order)
        FROM tokki_shop.product_images pi
        WHERE pi.product_id = p.product_id
    ), '{}') AS image_keys,
    SUM(oi.product_qty)::int AS units_sold,
    COUNT(DISTINCT oi.order_id)::int AS orders_count,
    ROUND(SUM(oi.product_qty * oi.product_price), 2) AS total_revenue
FROM tokki_shop.order_items oi
INNER JOIN tokki_shop.orders o
    ON o.order_id = oi.order_id
INNER JOIN tokki_shop.products p
    ON p.product_id = oi.product_id
WHERE o.status = 'approved'
  AND p.is_archived = false
  AND o.created_at >= $1::timestamptz
GROUP BY
    p.product_id,
    p.product_name,
    p.category,
    p.product_price,
    p.qty_available,
    p.in_stock
ORDER BY total_revenue DESC, units_sold DESC, p.product_id ASC
LIMIT $2;
`;

export function parseTopProductsQuery(query = {}) {
    let sort = 'units';
    if (query.sort !== undefined && query.sort !== '') {
        if (typeof query.sort !== 'string') {
            return { ok: false, message: 'sort must be one of: units, revenue.' };
        }
        const trimmedSort = query.sort.trim();
        if (trimmedSort !== '') {
            if (!ALLOWED_SORTS.includes(trimmedSort)) {
                return { ok: false, message: 'sort must be one of: units, revenue.' };
            }
            sort = trimmedSort;
        }
    }

    let period = 'all';
    if (query.period !== undefined && query.period !== '') {
        if (typeof query.period !== 'string') {
            return { ok: false, message: 'period must be one of: all, 7d, 30d, 90d.' };
        }
        const trimmedPeriod = query.period.trim();
        if (trimmedPeriod !== '') {
            if (!ALLOWED_PERIODS.includes(trimmedPeriod)) {
                return { ok: false, message: 'period must be one of: all, 7d, 30d, 90d.' };
            }
            period = trimmedPeriod;
        }
    }

    let limit = DEFAULT_LIMIT;
    if (query.limit !== undefined && query.limit !== '') {
        if (typeof query.limit !== 'string') {
            return { ok: false, message: 'limit must be a whole number between 1 and 20.' };
        }
        const trimmedLimit = query.limit.trim();
        if (trimmedLimit !== '') {
            if (!/^\d+$/.test(trimmedLimit)) {
                return { ok: false, message: 'limit must be a whole number between 1 and 20.' };
            }
            const parsedLimit = Number(trimmedLimit);
            if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_LIMIT) {
                return { ok: false, message: 'limit must be a whole number between 1 and 20.' };
            }
            limit = parsedLimit;
        }
    }

    return { ok: true, sort, period, limit };
}

export async function fetchTopProducts(
    dbExecutor,
    { sort = 'units', period = 'all', limit = DEFAULT_LIMIT, now = new Date() } = {}
) {
    let result;
    if (period === 'all') {
        const sql = sort === 'revenue' ? QUERY_TOP_BY_REVENUE_ALL : QUERY_TOP_BY_UNITS_ALL;
        result = await dbExecutor.query(sql, [limit]);
    } else {
        const sinceIso = new Date(now.getTime() - PERIOD_DAYS[period] * MS_PER_DAY).toISOString();
        const sql = sort === 'revenue' ? QUERY_TOP_BY_REVENUE_SINCE : QUERY_TOP_BY_UNITS_SINCE;
        result = await dbExecutor.query(sql, [sinceIso, limit]);
    }

    const rows = result?.rows ?? [];
    return attachImageUrls(rows).map((row) => ({
        ...row,
        product_price: String(row.product_price),
        qty_available: Number(row.qty_available),
        units_sold: Number(row.units_sold),
        orders_count: Number(row.orders_count),
        total_revenue: String(row.total_revenue)
    }));
}
