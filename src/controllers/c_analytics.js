import * as defaultDb from '../config/db.js';
import { parseTopProductsQuery, fetchTopProducts } from '../utils/topProducts.js';

export function createAnalyticsController({ db = defaultDb } = {}) {
    return {
        async getTopProducts(req, res, next) {
            try {
                const parsed = parseTopProductsQuery(req.query);
                if (!parsed.ok) {
                    return res.status(400).json({ success: false, message: parsed.message });
                }

                const data = await fetchTopProducts(db, parsed);
                return res.status(200).json({ success: true, data });
            } catch (err) {
                next(err);
            }
        }
    };
}

export const analyticsController = createAnalyticsController();
