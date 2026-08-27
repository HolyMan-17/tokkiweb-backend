export async function fetchOrderReceipt(dbExecutor, orderToken) {
    const getReceipt = `
        SELECT ord.order_id, ord.order_token, c.name, c.last_name, ord.contact_phone AS tlf_num, c.cedula,
        ord.delivery_type, ord.payment_method, ord.total_amount, ord.status,
        o_i.product_name, 
        o_i.product_qty, o_i.product_price,
        (o_i.product_qty * o_i.product_price) AS product_total,
        ord.created_at
        FROM tokki_shop.orders as ord 
        INNER JOIN tokki_shop.clients as c 
        ON ord.client_id=c.client_id 
        INNER JOIN tokki_shop.order_items as o_i 
        ON o_i.order_id=ord.order_id 
        WHERE ord.order_token = $1;
    `;
    const receiptQuery = await dbExecutor.query(getReceipt, [orderToken]);

    if (!receiptQuery || receiptQuery.rows.length === 0) {
        return null;
    }

    return {
        order_id: receiptQuery.rows[0].order_id,
        order_token: receiptQuery.rows[0].order_token,
        status: receiptQuery.rows[0].status,
        delivery_type: receiptQuery.rows[0].delivery_type,
        payment_method: receiptQuery.rows[0].payment_method,
        client: {
            name: receiptQuery.rows[0].name,
            last_name: receiptQuery.rows[0].last_name,
            tlf_num: receiptQuery.rows[0].tlf_num,
            cedula: receiptQuery.rows[0].cedula
        },
        total_amount: receiptQuery.rows[0].total_amount,
        created_at: receiptQuery.rows[0].created_at,
        items: receiptQuery.rows.map(row => ({
            product_name: row.product_name,
            product_qty: row.product_qty,
            product_price: row.product_price,
            product_total: row.product_total
        }))
    };
}
