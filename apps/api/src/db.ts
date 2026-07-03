import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg
export const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 })

db.on('error', (error) => console.error('Unexpected PostgreSQL error', error))
