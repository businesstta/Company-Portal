import bcrypt from 'bcryptjs'
import { db } from './db.js'

const adminPassword=process.env.SEED_ADMIN_PASSWORD
const employeePassword=process.env.SEED_EMPLOYEE_PASSWORD
if(!adminPassword||!employeePassword)throw new Error('Set SEED_ADMIN_PASSWORD and SEED_EMPLOYEE_PASSWORD before running the development seed')

const client = await db.connect()
try {
  await client.query('BEGIN')
  const existingCompany=await client.query(`SELECT company_id id FROM employees WHERE employee_no='EMP-0001' LIMIT 1`)
  const namedCompany=existingCompany.rowCount?existingCompany:await client.query(`SELECT id FROM companies WHERE name='Than Toe Aung Company' ORDER BY created_at LIMIT 1`)
  const companyId=namedCompany.rows[0]?.id??(await client.query(`INSERT INTO companies(name) VALUES('Than Toe Aung Company') RETURNING id`)).rows[0].id
  const names = ['Engineering','Sales & Marketing','Operations','Finance & HR']
  for (const name of names) await client.query(`INSERT INTO departments(company_id,name,code) VALUES($1,$2,$3) ON CONFLICT(company_id,code) DO NOTHING`, [companyId,name,name.slice(0,3).toUpperCase()])
  const dep = (await client.query(`SELECT id FROM departments WHERE company_id=$1 AND name='Finance & HR'`,[companyId])).rows[0].id
  const employee = await client.query(`INSERT INTO employees(company_id,department_id,employee_no,first_name,last_name,email,position,work_location,joined_on)
    VALUES($1,$2,'EMP-0001','admin','','admin@company.local','System Administrator','Yangon Office','2024-01-01') ON CONFLICT(employee_no) DO UPDATE SET first_name='admin',last_name='',email='admin@company.local',position='System Administrator',updated_at=now() RETURNING id`,[companyId,dep])
  const hash = await bcrypt.hash(adminPassword, 12)
  const user = await client.query(`INSERT INTO users(employee_id,email,username,password_hash,role) VALUES($1,'admin@company.local','admin',$2,'admin') ON CONFLICT(email) DO UPDATE SET username='admin',password_hash=$2,role='admin',is_active=true RETURNING id`,[employee.rows[0].id,hash])
  const menus=['Overview','Employees','Attendance','Approvals','Leave','Overtime','Appraisals','Announcements','Notification','Reports','Users & Roles','Corporate','Payment Request','Advance Clearance','Permission','Item Master','Settings']
  const defaults:Record<string,string[]>={admin:menus,hr:menus.filter(menu=>!['Permission'].includes(menu)),manager:['Overview','Employees','Attendance','Approvals','Leave','Overtime','Appraisals','Announcements','Notification','Reports','Corporate','Payment Request','Advance Clearance'],approver:['Overview','Attendance','Approvals','Leave','Overtime','Announcements','Notification','Corporate'],employee:['Overview','Attendance','Approvals','Leave','Overtime','Appraisals','Announcements','Notification','Corporate','Payment Request','Advance Clearance']}
  for(const [role,allowed] of Object.entries(defaults))for(const menu of menus)await client.query(`INSERT INTO role_permissions(company_id,role,menu_key,allowed,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(company_id,role,menu_key) DO NOTHING`,[companyId,role,menu,allowed.includes(menu),user.rows[0].id])
  const sample = [['Mya','Thiri','Engineering'],['Aung','Khant','Operations'],['Su','Nandar','Sales & Marketing'],['Htet','Htet','Finance & HR']]
  for (let i=0;i<sample.length;i++) {
    const [first,last,dept] = sample[i]
    const did=(await client.query('SELECT id FROM departments WHERE company_id=$1 AND name=$2',[companyId,dept])).rows[0].id
    const e=await client.query(`INSERT INTO employees(company_id,department_id,employee_no,first_name,last_name,email,position,work_location) VALUES($1,$2,$3,$4,$5,$6,'Team Member','Yangon Office') ON CONFLICT(employee_no) DO UPDATE SET first_name=$4,last_name=$5,email=$6,updated_at=now() RETURNING id`,[companyId,did,`EMP-000${i+2}`,first,last,`${first.toLowerCase()}@company.local`])
    await client.query(`INSERT INTO attendance(employee_id,work_date,check_in,status) VALUES($1,CURRENT_DATE,now()-interval '2 hours',$2) ON CONFLICT(employee_id,work_date) DO NOTHING`,[e.rows[0].id,i===2?'late':'present'])
  }
  const mobileEmployee=(await client.query(`SELECT id,email FROM employees WHERE employee_no='EMP-0002' LIMIT 1`)).rows[0]
  const employeeHash=await bcrypt.hash(employeePassword,12)
  await client.query(`INSERT INTO users(employee_id,email,password_hash,role) VALUES($1,'mya@company.local',$2,'employee') ON CONFLICT(employee_id) DO UPDATE SET email='mya@company.local',password_hash=$2,role='employee'`,[mobileEmployee.id,employeeHash])
  const ids=await client.query(`SELECT id, first_name FROM employees WHERE first_name IN ('Mya','Aung','Su','Htet')`)
  const types=['leave','overtime','early_out','attendance_correction']
  for (let i=0;i<ids.rows.length;i++) await client.query(`INSERT INTO requests(employee_id,request_type,title,reason,status,current_approver_id) SELECT $1,$2::varchar,$3,'Seed request','pending',$4 WHERE NOT EXISTS(SELECT 1 FROM requests WHERE employee_id=$1 AND request_type=$2::varchar)`,[ids.rows[i].id,types[i],`${types[i].replace('_',' ')} request`,user.rows[0].id])
  await client.query('COMMIT')
  console.log('Seed complete. Development credentials were loaded from environment variables.')
} catch(error) { await client.query('ROLLBACK'); throw error } finally { client.release(); await db.end() }
