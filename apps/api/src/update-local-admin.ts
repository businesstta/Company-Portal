import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { db } from './db.js'

const username = process.argv[2]
const password = process.argv[3]
if (!username || !password) throw new Error('Usage: pnpm local-admin -- <username> <password>')

const client = await db.connect()
try {
  await client.query('BEGIN')
  const account = (await client.query(
    `SELECT u.id,e.id employee_id
     FROM users u JOIN employees e ON e.id=u.employee_id
     WHERE u.email='admin@company.local' OR e.employee_no='EMP-0001'
     ORDER BY CASE WHEN u.email='admin@company.local' THEN 0 ELSE 1 END
     LIMIT 1 FOR UPDATE`,
  )).rows[0]
  if (!account) throw new Error('Local administrator account was not found')
  const duplicate = await client.query('SELECT 1 FROM users WHERE lower(username)=lower($1) AND id<>$2',[username,account.id])
  if (duplicate.rowCount) throw new Error(`Username already exists: ${username}`)
  await client.query(`UPDATE employees SET first_name=$1,last_name='',position='System Administrator',updated_at=now() WHERE id=$2`,[username,account.employee_id])
  await client.query(`UPDATE users SET username=$1,password_hash=$2,role='admin',is_active=true WHERE id=$3`,[username,await bcrypt.hash(password,12),account.id])
  await client.query('COMMIT')
  console.log(`Local administrator updated: ${username}`)
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release()
  await db.end()
}
