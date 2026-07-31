import * as db from '../config/db.js'; 
import argon2 from 'argon2';
import dotenv from 'dotenv';

dotenv.config();

export const userController = {
    async createUser(req, res, next){
        const dbClient = await db.getClient();
        try{
            const {email, password, user_type} = req.body;
            if(email === undefined || password === undefined || user_type === undefined){
                return res.status(400).json({success: false, message: "All user fields are required for registration."});
            }
            const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if(!regexEmail.test(email)){
                return res.status(400).json({success: false, message: "Invalid email format"});
            }

            const pepperedPwd = password + process.env.PASSWORD_PEPPER;
            const hashedPwd = await argon2.hash(pepperedPwd);

            if(!['tech_admin', 'shop_admin'].includes(user_type)){
                return res.status(400).json({success: false, message: "Invalid user type"});
            }

            const createUserQuery = `
            INSERT INTO tokki_shop.users(email, password, user_type, created_at) VALUES($1, $2, $3, NOW())
            RETURNING user_id, email, user_type, created_at;
            `
            const values = [email, hashedPwd, user_type];
            await dbClient.query('BEGIN');
            const resultQuery = await dbClient.query(createUserQuery, values);
            await dbClient.query('COMMIT');

            return res.status(201).json({success: true, row: resultQuery.rows[0]});
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

    async getAllUsers(req, res, next){
        try{
            const resQuery = await db.query(`SELECT user_id, email, user_type, created_at, last_login FROM tokki_shop.users`);
            if(resQuery.rows.length === 0){
                return res.status(200).json({success: true, message: "There's no registered users."})
            }
            return res.status(200).json({success: true, users: resQuery.rows})
        }catch(err){
            next(err);
        }
    },

    async getUser(req, res, next){
        try{
            const userId = req.params.user_id;
            const getQuery = `SELECT user_id, email, user_type, created_at, last_login FROM tokki_shop.users WHERE user_id = $1;`
            const resQuery = await db.query(getQuery, [userId]);
            if(resQuery.rows.length === 0){
                return res.status(409).json({success: true, message: "The provided user id does not exist."})
            }
        }catch(err){
            next(err);
        }
    }

}