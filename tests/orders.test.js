import { describe, expect, test, jest, beforeEach, afterAll } from '@jest/globals';
import { ordersController } from '../src/controllers/c_orders.js';
import * as db from '../src/config/db.js';

describe('ordersController', () => {
    afterAll(async () => {
        await db.endPool();
    });

    describe('createOrder validation', () => {
        let req, res, next;

        beforeEach(() => {
            req = {
                body: {
                    client_info: {
                        name: 'Ana',
                        last_name: 'Perez',
                        cedula: 'V-12345678',
                        country_code: '+58',
                        tlf_num: '04141234567'
                    },
                    delivery_type: 'delivery',
                    payment_method: 'pago_movil',
                    items: [
                        { product_id: 1, product_qty: 2 }
                    ]
                }
            };
            res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn().mockReturnThis()
            };
            next = jest.fn();
        });

        test('returns 400 if client_info is missing', async () => {
            delete req.body.client_info;
            await ordersController.createOrder(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'All fields are required.'
            }));
        });

        test('returns 400 if client_info is missing name, last_name, or tlf_num', async () => {
            req.body.client_info.name = '';
            await ordersController.createOrder(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'All client info fields are required.'
            }));
        });

        test('returns 400 if cedula is missing or invalid format', async () => {
            delete req.body.client_info.cedula;
            await ordersController.createOrder(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'A valid cedula (e.g. V-12345678) is required.'
            }));

            req.body.client_info.cedula = 'invalid-cedula';
            await ordersController.createOrder(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'A valid cedula (e.g. V-12345678) is required.'
            }));
        });

        test('returns 400 if phone format is invalid', async () => {
            req.body.client_info.tlf_num = '123';
            await ordersController.createOrder(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'Phone number must be a valid international format.'
            }));
        });

        test('returns 400 if delivery_type is invalid', async () => {
            req.body.delivery_type = 'teleport';
            await ordersController.createOrder(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'delivery_type must be one of: envio_nacional, delivery, retiro_tienda.'
            }));
        });
    });

    describe('getOrderReceipt', () => {
        let req, res, next;

        beforeEach(() => {
            req = {
                params: {
                    order_token: '550e8400-e29b-41d4-a716-446655440000'
                }
            };
            res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn().mockReturnThis()
            };
            next = jest.fn();
        });

        test('returns 400 if order_token is not a valid UUID', async () => {
            req.params.order_token = 'invalid-token';
            await ordersController.getOrderReceipt(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'Invalid order token format.'
            }));
        });
    });
});

