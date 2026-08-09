import * as db from '../config/db.js';
import { normalizeAndValidatePhone } from '../utils/validate.js';

export const ordersController = {
    async createOrder(req, res, next) {
        const dbClient = await db.getClient();
        try{
            const {client_info, delivery_type, payment_method, items} = req.body;

            if(client_info === undefined || delivery_type === undefined || payment_method === undefined || items === undefined){
                return res.status(400).json({success: false, message: "All fields are required."})
            }
            if(!client_info.name || !client_info.last_name || !client_info.tlf_num){
                return res.status(400).json({success: false, message: "All client info fields are required."})
            }
            const normalizedPhone = normalizeAndValidatePhone(client_info.country_code, client_info.tlf_num);
            if(!normalizedPhone){
                return res.status(400).json({success: false, message: "Phone number must be a valid international format."})
            }
            if(!delivery_type || !payment_method || !Array.isArray(items) || items.length === 0){
                return res.status(400).json({success: false, message: "Valid delivery_type, payment_method, and items are required."})
            }
            const queryClient = 'SELECT client_id FROM tokki_shop.clients WHERE tlf_num=$1';
            const phone = [normalizedPhone];
            let client_id = '';
            const resquery = await dbClient.query(queryClient, phone);
            if(resquery.rows.length !== 0){
                client_id = resquery.rows[0].client_id;
            }else{
                await dbClient.query('BEGIN');
                const insertQuery = `INSERT INTO tokki_shop.clients(name, last_name, tlf_num) VALUES($1, $2, $3) RETURNING
                client_id, name, last_name, tlf_num
                `;
                const values = [client_info.name, client_info.last_name, normalizedPhone];
                const newClientRes = await dbClient.query(insertQuery, values);
                await dbClient.query('COMMIT');
                client_id = newClientRes.rows[0].client_id;
            }

            let total_amount = 0.00;
            const ordered_items = [];
            await dbClient.query('BEGIN');
            for (const i of items){
                const prod_info = await dbClient.query(`
                    SELECT product_name, product_price, qty_available 
                    FROM tokki_shop.products 
                    WHERE product_id=$1 FOR UPDATE
                    `, [i.product_id])
                if(prod_info.rows.length === 0){
                    await dbClient.query('ROLLBACK');
                    return res.status(404).json({"success": false, "message": "Product was not found."})
                }
                if(i.product_qty <= 0){
                    await dbClient.query('ROLLBACK');
                    return res.status(400).json({"success": false, "message": "Product quantity must be a positive number."})
                }
                if((prod_info.rows[0].qty_available - i.product_qty) >= 0){
                    await dbClient.query(
                    `UPDATE tokki_shop.products
                    SET qty_available = qty_available - $1, in_stock = (qty_available - $1 > 0)
                    WHERE product_id = $2`, [i.product_qty, i.product_id]);
                }
                else{
                    await dbClient.query('ROLLBACK');
                    return res.status(400).json({"success": false, "message": "Requested quantity is not available in the stock."})
                }
                total_amount += (i.product_qty * prod_info.rows[0].product_price);
                ordered_items.push({"id": i.product_id, "name": prod_info.rows[0].product_name, "ordered_qty": i.product_qty, "price": prod_info.rows[0].product_price})
                
            }


            const orderValues = [client_id, delivery_type, total_amount, payment_method, null, 'pending']
            const orderQuery = await dbClient.query(`
                INSERT INTO tokki_shop.orders(client_id, delivery_type, total_amount, payment_method, processed_by, status, created_at) 
                VALUES($1, $2, $3, $4, $5, $6, NOW()) RETURNING order_id`, orderValues);
            
            for (const product of ordered_items){
                const orderItemsQuery = await dbClient.query(`INSERT INTO 
                    tokki_shop.order_items(order_id, product_id, product_name, product_qty, product_price)
                    VALUES($1, $2, $3, $4, $5)`, [orderQuery.rows[0].order_id, product.id, product.name, product.ordered_qty, product.price])
            }
            await dbClient.query('COMMIT');
            return res.status(201).json({
                success: true,
                data: {
                    order_id: orderQuery.rows[0].order_id,
                    total_amount,
                    items: ordered_items
                },
                message: "Order has been successfully created."
            })
        }catch(err){
            if(dbClient){
                await dbClient.query('ROLLBACK');
            }
            next(err);
        }finally{
                    if(dbClient){
                        await dbClient.release();
                    }
                }
    },

    async getAllOrders(req, res, next){
        try{
            const getQuery = `
                            SELECT ord.order_id, c.name, c.last_name, c.tlf_num, ord.total_amount, ord.status,
                            COUNT(o_i.product_id) AS item_count, ord.created_at
                            FROM tokki_shop.orders as ord 
                            INNER JOIN tokki_shop.clients as c 
                            ON ord.client_id=c.client_id 
                            INNER JOIN tokki_shop.order_items as o_i 
                            ON o_i.order_id=ord.order_id 
                            GROUP BY ord.order_id, c.name, c.last_name, c.tlf_num, ord.status
                            ORDER BY ord.order_id DESC;
                            `;
            const resGet = await db.query(getQuery);

            if(resGet.rows.length === 0){
                return res.status(200).json({success: true, message:"No orders have been placed."});
            }

            return res.status(200).json({success: true, data: resGet.rows})

        }catch(err){
            next(err);
        }
    },
    
    async getSingleOrder(req, res, next){
        try{
            const order_id = req.params.order_id;
            const getOrder = `
                            SELECT ord.order_id, c.name, c.last_name, c.tlf_num, ord.total_amount, ord.status,
                            o_i.product_name, 
                            o_i.product_qty, o_i.product_price,
                            (o_i.product_qty * o_i.product_price) AS product_total,
                            ord.created_at
                            FROM tokki_shop.orders as ord 
                            INNER JOIN tokki_shop.clients as c 
                            ON ord.client_id=c.client_id 
                            INNER JOIN tokki_shop.order_items as o_i 
                            ON o_i.order_id=ord.order_id 
                            WHERE ord.order_id = $1;
                            `;
            const orderQuery = await db.query(getOrder, [order_id]);

            if(orderQuery.rows.length === 0){
                return res.status(404).json({success: false, message: "Order doesn't exist."})
            }

            const data = {
                order_id: orderQuery.rows[0].order_id,
                status: orderQuery.rows[0].status,
                client: {
                    name: orderQuery.rows[0].name,
                    last_name: orderQuery.rows[0].last_name,
                    tlf_num: orderQuery.rows[0].tlf_num
                },
                total_amount: orderQuery.rows[0].total_amount,
                created_at: orderQuery.rows[0].created_at,
                items: orderQuery.rows.map(row => ({
                    product_name: row.product_name,
                    product_qty: row.product_qty,
                    product_price: row.product_price,
                    product_total: row.product_total
                }))
            };

            return res.status(200).json({success: true, data: data, message: "Order retrieved."})
        }catch(err){
            next(err);
        }
    },

    async getClientHistory(req, res, next){
        const client_id = req.params.client_id;
        const getHistory = `
                            SELECT ord.order_id, c.name, c.last_name, c.tlf_num, ord.total_amount, ord.status,
                            COUNT(o_i.product_id) AS item_count, ord.created_at
                            FROM tokki_shop.orders as ord 
                            INNER JOIN tokki_shop.clients as c 
                            ON ord.client_id=c.client_id 
                            INNER JOIN tokki_shop.order_items as o_i 
                            ON o_i.order_id=ord.order_id WHERE ord.client_id = $1
                            GROUP BY ord.order_id, c.name, c.last_name, c.tlf_num, ord.status
                            ORDER BY ord.order_id DESC;
                            `;
        try{
            const historyQuery = await db.query(getHistory, [client_id]);

            if(historyQuery.rows.length === 0){
                    return res.status(200).json({success: true, message:"No orders have been placed by this client."});
                }
        
            return res.status(200).json({success: true, data: historyQuery.rows});
        }catch(err){
            next(err);
        }
    },

    async cancelOrder(res, req, next){
        const dbClient = await db.getClient();
        try{
            const orderId = req.params.order_id;
            const getOrder =    ` 
                                    SELECT status
                                    FROM orders 
                                    WHERE order_id=$1;
                                `
            const queryStatus = await dbClient.query(getOrder, [orderId]);
            if(queryStatus.rows[0].status === "canceled"){
                
            }
        }catch(err){
            if(dbClient){
                await dbClient.query('ROLLBACK');
            }
            next(err);
        }finally{
            if(dbClient){
                await dbClient.release();
            }
        }
    }
}