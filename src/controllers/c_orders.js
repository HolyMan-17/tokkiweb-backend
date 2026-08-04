import * as db from '../config/db.js';

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
            const queryClient = 'SELECT client_id FROM tokki_shop.clients WHERE tlf_num=$1';
            const phone = [client_info.tlf_num];
            let client_id = '';
            const resquery = await dbClient.query(queryClient, phone);
            if(resquery.rows.length !== 0){
                client_id = resquery.rows[0].client_id;
            }else{
                await dbClient.query('BEGIN');
                const insertQuery = `INSERT INTO tokki_shop.clients(name, last_name, tlf_num) VALUES($1, $2, $3) RETURNING
                client_id, name, last_name, tlf_num
                `;
                const values = [client_info.name, client_info.last_name, client_info.tlf_num];
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


            const orderValues = [client_id, delivery_type, total_amount, payment_method, null]
            const orderQuery = await dbClient.query(`
                INSERT INTO tokki_shop.orders(client_id, delivery_type, total_amount, payment_method, processed_by, created_at) 
                VALUES($1, $2, $3, $4, $5, NOW()) RETURNING order_id`, orderValues);
            
            for (const product of ordered_items){
                const orderItemsQuery = await dbClient.query(`INSERT INTO 
                    tokki_shop.order_items(order_id, product_id, product_name, product_qty, product_price)
                    VALUES($1, $2, $3, $4, $5)`, [orderQuery.rows[0].order_id, product.id, product.name, product.ordered_qty, product.price])
            }
            await dbClient.query('COMMIT');
            return res.status(201).json({success:true, order_id: orderQuery.rows[0].order_id, order_amount: total_amount, message:"Order has been successfully created."})
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