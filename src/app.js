import express from 'express';
import cors from 'cors';
import * as db from './config/db.js';
import apiRouter from './routes/index.js';

const app = express();

app.use(cors());                      // Allows your React frontend to connect to this API
app.use(express.json());              // Allows your server to read JSON sent in request bodies
app.use(express.urlencoded({ extended: true })); // Parses URL-encoded form data
app.use('/api', apiRouter);

// 2. Health check route (verifies API is online)
app.get('/app/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: "Kill yourself as soon as possible" });
});

app.get('/clients', async (req, res) => {
        const queryres = await db.query('SELECT * from tokki_shop.clients')
        return res.status(200).json({success: true, rows:queryres.rows})
    })

app.post('/client', (req, res) =>{
    try {
        const {name, last_name, tlf_num} = req.body;
        
        if(!name || !last_name || !tlf_num){
            return res.status(400).json({
                success: false,
                message: 'All client info fields are required.'
            });
        }

        const creationquery = `
        INSERT INTO tokki_shop.clients(name, last_name, tlf_num) 
        VALUES ($1, $2, $3)
        RETURNING client_id, name, last_name, tlf_num
        `
        const values = [name, last_name, tlf_num || 0];
        db.query(creationquery, values).then((queryres) =>
            res.status(201).json({success: true, row: queryres.rows[0]})
            );
    } catch(err){
        res.status(500).json({
            success: false,
            result: `Absolute failure, ${err}`
        })

    }
})

app.put('/client/info/:client_id', async (req, res) => {
        const client_id = req.params.client_id;
        const {name, last_name, tlf_num} = req.body;
        try{
            const rowcheck = await db.query('SELECT * FROM tokki_shop.clients WHERE client_id=$1',[client_id])
            if (rowcheck.rows.length === 0){
                return res.status(404).json({message: "Row doesn't exist"})
            }
        }catch(err){
            return res.status(404).json({message: `ts fucked bro 🥀 ${err}`})
        }

        try{
            const updquery = `
            UPDATE tokki_shop.clients SET name=$1,last_name=$2,tlf_num=$3
            WHERE client_id=$4 RETURNING client_id, name, last_name, tlf_num;
            `;
            const values = [name, last_name, tlf_num, client_id || 0];
            const updateRes = await db.query(updquery, values)
            return  res.status(201).json({success: true, row:updateRes.rows[0]})
        }catch(err){
            return res.status(404).json({success: false, message: `Hot garbage ${err}`})
        }
})

// 3. Fallback Route (404 Not Found)
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

export default app