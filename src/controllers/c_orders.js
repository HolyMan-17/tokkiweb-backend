import * as db from '../config/db.js';

export const ordersController = {
    async createOrder(req, res, next) {
        const dbClient = await db.getClient();
        try{
            const {client_info, delivery_type, payment_method, items} = req.body;
            const queryClient = 'SELECT client.id FROM clients WHERE tlf_num=$1';
            const phone = client_info.tlf_num;
        }catch(err){
            next(err);
        }
    }
}