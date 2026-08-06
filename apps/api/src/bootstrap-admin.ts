import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from './db.js'

const input = z.object({
  companyName: z.string().trim().min(2).max(150),
  employeeNo: z.string().trim().min(1).max(30),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80),
  email: z.string().trim().email().max(180),
  username: z.string().trim().min(2).max(180),
  password: z.string().min(12).max(128),
}).parse({
  companyName: process.env.COMPANY_NAME,
  employeeNo: process.env.ADMIN_EMPLOYEE_NO,
  firstName: process.env.ADMIN_FIRST_NAME,
  lastName: process.env.ADMIN_LAST_NAME ?? '',
  email: process.env.ADMIN_EMAIL,
  username: process.env.ADMIN_USERNAME,
  password: process.env.ADMIN_PASSWORD,
})

const client = await db.connect()
try {
  await client.query('BEGIN')

  const existingCompany = (await client.query(
    'SELECT id FROM companies WHERE lower(name)=lower($1) ORDER BY created_at LIMIT 1',
    [input.companyName],
  )).rows[0]
  const company = existingCompany ?? (await client.query(
    'INSERT INTO companies(name) VALUES($1) RETURNING id',
    [input.companyName],
  )).rows[0]

  if (!company) throw new Error('Unable to create or find the company record')

  const department = (await client.query(
    `INSERT INTO departments(company_id,name,code)
     VALUES($1,'Administration','ADMIN')
     ON CONFLICT(company_id,code) DO UPDATE SET name=EXCLUDED.name
     RETURNING id`,
    [company.id],
  )).rows[0]

  const employee = (await client.query(
    `INSERT INTO employees(company_id,department_id,employee_no,first_name,last_name,email,position,employment_status)
     VALUES($1,$2,$3,$4,$5,$6,'System Administrator','active')
     ON CONFLICT(employee_no) DO UPDATE SET
       company_id=EXCLUDED.company_id,
       department_id=EXCLUDED.department_id,
       first_name=EXCLUDED.first_name,
       last_name=EXCLUDED.last_name,
       email=EXCLUDED.email,
       position=EXCLUDED.position,
       employment_status='active',
       updated_at=now()
     RETURNING id`,
    [company.id, department.id, input.employeeNo, input.firstName, input.lastName, input.email],
  )).rows[0]

  const passwordHash = await bcrypt.hash(input.password, 12)
  await client.query(
    `INSERT INTO users(employee_id,email,username,password_hash,role,is_active)
     VALUES($1,$2,$3,$4,'admin',true)
     ON CONFLICT(employee_id) DO UPDATE SET
       email=EXCLUDED.email,
       username=EXCLUDED.username,
       password_hash=EXCLUDED.password_hash,
       role='admin',
       is_active=true`,
    [employee.id, input.email, input.username, passwordHash],
  )

  const systemRoles = [
    ['admin', 'Admin'],
    ['hr', 'HR'],
    ['manager', 'Manager'],
    ['approver', 'Approver'],
    ['employee', 'Employee'],
  ]
  for (const [roleKey, roleName] of systemRoles) {
    await client.query(
      `INSERT INTO user_roles(company_id,role_key,role_name,is_system)
       VALUES($1,$2,$3,true)
       ON CONFLICT(company_id,role_key) DO UPDATE SET role_name=EXCLUDED.role_name,is_system=true`,
      [company.id, roleKey, roleName],
    )
  }

  await client.query('COMMIT')
  console.log(`Production administrator is ready: ${input.username}`)
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release()
  await db.end()
}
