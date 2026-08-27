import { describe, expect, test, jest } from '@jest/globals';
import { fetchOrderReceipt } from '../src/utils/orderReceipt.js';

describe('fetchOrderReceipt', () => {
    test('returns formatted receipt object when order_token matches', async () => {
        const mockDb = {
            query: jest.fn().mockResolvedValue({
                rows: [
                    {
                        order_id: 42,
                        order_token: '550e8400-e29b-41d4-a716-446655440000',
                        name: 'Ana',
                        last_name: 'Gomez',
                        tlf_num: '+584149876543',
                        cedula: 'V-12345678',
                        delivery_type: 'envio_nacional',
                        payment_method: 'binance',
                        total_amount: '45.00',
                        status: 'pending',
                        product_name: 'Tokki Hoodie',
                        product_qty: 1,
                        product_price: '35.00',
                        product_total: '35.00',
                        created_at: '2026-08-26T12:00:00.000Z'
                    },
                    {
                        order_id: 42,
                        order_token: '550e8400-e29b-41d4-a716-446655440000',
                        name: 'Ana',
                        last_name: 'Gomez',
                        tlf_num: '+584149876543',
                        cedula: 'V-12345678',
                        delivery_type: 'envio_nacional',
                        payment_method: 'binance',
                        total_amount: '45.00',
                        status: 'pending',
                        product_name: 'Pocky Fresa',
                        product_qty: 2,
                        product_price: '5.00',
                        product_total: '10.00',
                        created_at: '2026-08-26T12:00:00.000Z'
                    }
                ]
            })
        };

        const result = await fetchOrderReceipt(mockDb, '550e8400-e29b-41d4-a716-446655440000');

        expect(result).toEqual({
            order_id: 42,
            order_token: '550e8400-e29b-41d4-a716-446655440000',
            status: 'pending',
            delivery_type: 'envio_nacional',
            payment_method: 'binance',
            client: {
                name: 'Ana',
                last_name: 'Gomez',
                tlf_num: '+584149876543',
                cedula: 'V-12345678'
            },
            total_amount: '45.00',
            created_at: '2026-08-26T12:00:00.000Z',
            items: [
                {
                    product_name: 'Tokki Hoodie',
                    product_qty: 1,
                    product_price: '35.00',
                    product_total: '35.00'
                },
                {
                    product_name: 'Pocky Fresa',
                    product_qty: 2,
                    product_price: '5.00',
                    product_total: '10.00'
                }
            ]
        });

        expect(mockDb.query).toHaveBeenCalledWith(
            expect.stringContaining('WHERE ord.order_token = $1'),
            ['550e8400-e29b-41d4-a716-446655440000']
        );
    });

    test('returns null when order is not found', async () => {
        const mockDb = {
            query: jest.fn().mockResolvedValue({ rows: [] })
        };

        const result = await fetchOrderReceipt(mockDb, '550e8400-e29b-41d4-a716-446655440000');
        expect(result).toBeNull();
    });
});
