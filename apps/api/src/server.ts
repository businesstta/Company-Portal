import 'dotenv/config'
import bcrypt from 'bcryptjs'
import cors from 'cors'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import ExcelJS from 'exceljs'
import express, { type NextFunction, type Request, type Response } from 'express'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import { z } from 'zod'
import { db } from './db.js'

type AuthRequest = Request & { user?: { id: string; employeeId: string; role: string } }
const app = express()
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024},fileFilter:(_req,file,cb)=>cb(null,/\.xlsx$/i.test(file.originalname))})
const uploadDirectory=join(process.cwd(),'uploads');mkdirSync(uploadDirectory,{recursive:true})
const attachmentUpload=multer({storage:multer.diskStorage({destination:uploadDirectory,filename:(_req,file,cb)=>cb(null,`${randomUUID()}${extname(file.originalname).toLowerCase()}`)}),limits:{fileSize:10*1024*1024,files:5},fileFilter:(_req,file,cb)=>cb(null,/^(image\/(jpeg|png|webp|gif)|application\/pdf|application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet))$/.test(file.mimetype))})
app.use(cors({ origin: process.env.WEB_ORIGIN?.split(',') ?? true }))
app.use(express.json({ limit: '1mb' }))

const auth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace(/^Bearer /, '')
  try { req.user = jwt.verify(token ?? '', process.env.JWT_SECRET!) as AuthRequest['user']; next() }
  catch { res.status(401).json({ error: 'Authentication required' }) }
}
const permit=(menuKey:string)=>async(req:AuthRequest,res:Response,next:NextFunction)=>{if(req.user?.role==='admin')return next();const result=await db.query(`SELECT 1 FROM role_permissions rp JOIN employees e ON e.company_id=rp.company_id WHERE e.id=$1 AND rp.role=$2 AND rp.menu_key=$3 AND rp.allowed=true`,[req.user!.employeeId,req.user!.role,menuKey]);if(!result.rowCount)return res.status(403).json({error:`Permission denied: ${menuKey}`});next()}
const asyncRoute = (fn: (req: AuthRequest,res: Response)=>Promise<unknown>) => (req: AuthRequest,res: Response,next: NextFunction) => Promise.resolve(fn(req,res)).catch(next)
const employeeUsername=(name:string)=>name.trim().toLowerCase().replace(/\s+/g,' ')
const createEmployeeUser=async(query:{query:(text:string,values?:unknown[])=>Promise<{rows:Record<string,unknown>[];rowCount:number|null}>},employeeId:string|string[],name:string,email:string,passwordHash:string)=>{
  const normalizedEmployeeId=String(employeeId);const base=employeeUsername(name);let username=base;let suffix=2
  while((await query.query('SELECT 1 FROM users WHERE lower(username)=lower($1) AND employee_id<>$2',[username,normalizedEmployeeId])).rowCount)username=`${base} ${suffix++}`
  await query.query(`INSERT INTO users(employee_id,email,username,password_hash,role) VALUES($1,$2,$3,$4,'employee') ON CONFLICT(employee_id) DO UPDATE SET username=EXCLUDED.username,email=EXCLUDED.email`,[normalizedEmployeeId,email,username,passwordHash])
}

app.get('/health', asyncRoute(async (_req,res) => {
  const result = await db.query('SELECT now() AS database_time')
  res.json({ status: 'ok', database: 'connected', databaseTime: result.rows[0].database_time })
}))

app.post('/api/auth/login', asyncRoute(async (req,res) => {
  const input=z.object({username:z.string().min(1).optional(),email:z.string().min(1).optional(),password:z.string().min(8)}).refine(value=>value.username||value.email).parse(req.body);const login=input.username??input.email!
  const result=await db.query(`SELECT u.id,u.employee_id,u.email,u.username,u.password_hash,u.role,e.first_name,e.last_name FROM users u JOIN employees e ON e.id=u.employee_id WHERE (lower(u.username)=lower($1) OR lower(u.email)=lower($1)) AND u.is_active=true`,[login])
  const user=result.rows[0]
  if(!user || !await bcrypt.compare(input.password,user.password_hash)) return res.status(401).json({error:'Invalid email or password'})
  await db.query('UPDATE users SET last_login_at=now() WHERE id=$1',[user.id])
  const token=jwt.sign({id:user.id,employeeId:user.employee_id,role:user.role},process.env.JWT_SECRET!,{expiresIn:'8h'})
  res.json({token,user:{id:user.id,email:user.email,username:user.username,role:user.role,name:`${user.first_name} ${user.last_name}`.trim()}})
}))

app.post('/api/auth/change-password',auth,asyncRoute(async(req,res)=>{
  const input=z.object({currentPassword:z.string().min(8),newPassword:z.string().min(8).max(128)}).parse(req.body);const result=await db.query('SELECT password_hash FROM users WHERE id=$1 AND is_active=true',[req.user!.id]);if(!result.rowCount||!await bcrypt.compare(input.currentPassword,result.rows[0].password_hash))return res.status(400).json({error:'Current password is incorrect'});const hash=await bcrypt.hash(input.newPassword,12);await db.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hash,req.user!.id]);res.json({message:'Password changed successfully'})
}))

app.get('/api/dashboard', auth, asyncRoute(async (_req,res) => {
  if(_req.user!.role==='employee'){const [attendance,pending]=await Promise.all([db.query(`SELECT status FROM attendance WHERE employee_id=$1 AND work_date=CURRENT_DATE`,[_req.user!.employeeId]),db.query(`SELECT count(*)::int total FROM requests WHERE employee_id=$1 AND status='pending'`,[_req.user!.employeeId])]);const status=attendance.rows[0]?.status;return res.json({stats:{totalEmployees:1,presentToday:status==='present'?1:0,lateToday:status==='late'?1:0,pendingApprovals:pending.rows[0].total},departments:[]})}
  const [employees,attendance,pending,departments]=await Promise.all([
    db.query(`SELECT count(*)::int total FROM employees WHERE employment_status='active'`),
    db.query(`SELECT count(*) FILTER(WHERE status='present')::int present,count(*) FILTER(WHERE status='late')::int late,count(*)::int recorded FROM attendance WHERE work_date=CURRENT_DATE`),
    db.query(`SELECT count(*)::int total FROM requests WHERE status='pending'`),
    db.query(`SELECT d.name,count(e.id)::int employees,count(a.id) FILTER(WHERE a.status IN ('present','late'))::int present FROM departments d LEFT JOIN employees e ON e.department_id=d.id LEFT JOIN attendance a ON a.employee_id=e.id AND a.work_date=CURRENT_DATE GROUP BY d.id,d.name ORDER BY d.name`)
  ])
  const total=employees.rows[0].total
  res.json({stats:{totalEmployees:total,presentToday:attendance.rows[0].present,lateToday:attendance.rows[0].late,pendingApprovals:pending.rows[0].total},departments:departments.rows.map(d=>({...d,rate:d.employees?Math.round(d.present/d.employees*100):0}))})
}))

app.get('/api/employees', auth, asyncRoute(async (req,res) => {
  const result=await db.query(`SELECT e.id,e.employee_no,e.first_name,e.last_name,e.email,u.username,e.position,e.organization,e.project_location,e.work_location,e.employment_status,e.created_at,d.name department,COALESCE(NULLIF(trim(m.first_name||' '||m.last_name),''),m.employee_no) report_to FROM employees e LEFT JOIN users u ON u.employee_id=e.id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN employees m ON m.id=e.manager_id WHERE ($1::text IS NULL OR e.first_name ILIKE '%'||$1||'%' OR e.last_name ILIKE '%'||$1||'%' OR e.employee_no ILIKE '%'||$1||'%') ORDER BY e.created_at DESC LIMIT 500`,[typeof req.query.q==='string'?req.query.q:null])
  res.json(result.rows)
}))

const employeeColumns=[
  ['Sr No','sr_no',10],['Employee ID','employee_no',16],['Employee Name (Eng)','name_eng',24],['Employee Name (MM)','name_mm',24],['Position','position',22],['Department','department',22],['Organization','organization',22],['Project Location','project_location',22],['NRC No (MM)','nrc_no_mm',20],['NRC No (Eng)','nrc_no_eng',20],['DOB(Eng)','date_of_birth',15],['Age','age',10],['Join Date','joined_on',15],['Permanent Date','permanent_date',15],['Service Year','service_year',14],['Gender','gender',12],['Blood Type','blood_type',12],['Father Name','father_name',22],['Marital Status','marital_status',16],['Has Children','has_children',14],['Number of Children','number_of_children',18],['Nationality','nationality',16],['Education','education',24],['Other Qualification','other_qualification',24],['Personal Phone No','phone',19],['Business Phone No','business_phone_no',19],['Business Email','business_email',28],['Current Address','current_address',32],['Probation/Permanent','employment_type',20],['Branch','branch',18],['Resign/Retired/Terminate (Date)','separation_date',28],['Report To','report_to',22],['Shift (Yes/No)','shift_required',16],['Bank Account / Pay Number','bank_account_pay_number',26]
] as const

const employeeWorkbook=async(rows?:Record<string,unknown>[])=>{
  const workbook=new ExcelJS.Workbook();workbook.creator='Company Portal';const sheet=workbook.addWorksheet('Employees',{views:[{state:'frozen',ySplit:1,xSplit:2}]})
  sheet.columns=employeeColumns.map(([header,key,width])=>({header,key,width}))
  sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF6554DC'}};cell.alignment={vertical:'middle',wrapText:true};cell.border={bottom:{style:'thin',color:{argb:'FF493AAE'}}}});sheet.getRow(1).height=34;sheet.autoFilter=`A1:${sheet.getColumn(employeeColumns.length).letter}1`
  if(rows?.length)rows.forEach((row,index)=>sheet.addRow({...row,sr_no:index+1}));else sheet.addRow({sr_no:1,employee_no:'EMP-0006',name_eng:'Example Employee',name_mm:'နမူနာ ဝန်ထမ်း',position:'Software Engineer',department:'Engineering',organization:'Head Office',project_location:'Yangon',nrc_no_mm:'',nrc_no_eng:'',date_of_birth:'1995-01-15',age:31,joined_on:'2024-01-01',permanent_date:'2024-04-01',service_year:2.5,gender:'Male',blood_type:'O+',father_name:'',marital_status:'Single',has_children:'No',number_of_children:0,nationality:'Myanmar',education:'Bachelor Degree',other_qualification:'',phone:'09xxxxxxxxx',business_phone_no:'',business_email:'example@company.local',current_address:'Yangon',employment_type:'Permanent',branch:'Yangon',separation_date:'',report_to:'EMP-0001',shift_required:'No',bank_account_pay_number:''})
  const textKeys=['employee_no','nrc_no_mm','nrc_no_eng','phone','business_phone_no','bank_account_pay_number'];textKeys.forEach(key=>sheet.getColumn(key).numFmt='@')
  const dateKeys=['date_of_birth','joined_on','permanent_date','separation_date'];dateKeys.forEach(key=>sheet.getColumn(key).numFmt='yyyy-mm-dd')
  sheet.getColumn('gender').eachCell((cell,row)=>{if(row>1)cell.dataValidation={type:'list',allowBlank:true,formulae:['"Male,Female,Other"']}});for(const key of ['has_children','shift_required'])sheet.getColumn(key).eachCell((cell,row)=>{if(row>1)cell.dataValidation={type:'list',allowBlank:true,formulae:['"Yes,No"']}})
  const instructions=workbook.addWorksheet('Instructions');instructions.columns=[{width:32},{width:90}];instructions.addRows([['Field','Instructions'],['Employee ID','Required and unique. Example: EMP-0006'],['Employee Name (Eng)','Required'],['Department','Must exactly match an existing department name'],['Date columns','Use YYYY-MM-DD, for example 1995-01-15'],['Yes/No columns','Use Yes or No only'],['NRC / Phone / Bank','Formatted as text to preserve leading zeroes'],['Business Email','Optional; if present it must be a valid unique email'],['Import notes','Do not rename the Employees sheet or any header. Remove the example row before entering real data. Existing Employee IDs are updated; new IDs are inserted.']]);instructions.getRow(1).font={bold:true}
  return workbook
}

app.get('/api/employees/template', auth, asyncRoute(async (_req,res) => {const buffer=await (await employeeWorkbook()).xlsx.writeBuffer();res.setHeader('Content-Disposition','attachment; filename="employee-import-template.xlsx"');res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buffer))}))

app.get('/api/employees/export', auth, asyncRoute(async (_req,res) => {const result=await db.query(`SELECT e.employee_no,trim(e.first_name||' '||e.last_name) name_eng,e.name_mm,e.position,d.name department,e.organization,e.project_location,e.nrc_no_mm,e.nrc_no_eng,e.date_of_birth,COALESCE(e.age,EXTRACT(YEAR FROM age(CURRENT_DATE,e.date_of_birth))::int) age,e.joined_on,e.permanent_date,COALESCE(e.service_year,round((CURRENT_DATE-e.joined_on)/365.25,2)) service_year,e.gender,e.blood_type,e.father_name,e.marital_status,CASE WHEN e.has_children THEN 'Yes' WHEN e.has_children=false THEN 'No' END has_children,e.number_of_children,e.nationality,e.education,e.other_qualification,e.phone,e.business_phone_no,e.business_email,e.current_address,e.employment_type,e.branch,e.separation_date,COALESCE(m.employee_no,trim(m.first_name||' '||m.last_name)) report_to,CASE WHEN e.shift_required THEN 'Yes' WHEN e.shift_required=false THEN 'No' END shift_required,e.bank_account_pay_number FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN employees m ON m.id=e.manager_id ORDER BY e.employee_no`);const buffer=await (await employeeWorkbook(result.rows)).xlsx.writeBuffer();res.setHeader('Content-Disposition',`attachment; filename="employees-${new Date().toISOString().slice(0,10)}.xlsx"`);res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buffer))}))

app.post('/api/employees/import',auth,upload.single('file'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});if(!req.file)return res.status(400).json({error:'An .xlsx file is required'})
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(req.file.buffer as unknown as ExcelJS.Buffer);const sheet=workbook.getWorksheet('Employees')??workbook.worksheets[0];if(!sheet)return res.status(400).json({error:'Employees worksheet not found'})
  const headers=new Map<string,number>();sheet.getRow(1).eachCell((cell,col)=>headers.set(String(cell.value).trim().toLowerCase(),col));const required=employeeColumns.map(([header])=>header.toLowerCase());const missing=required.filter(h=>!headers.has(h));if(missing.length)return res.status(400).json({error:`Missing columns: ${missing.join(', ')}`})
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const departments=await db.query('SELECT id,lower(name) AS lower_name FROM departments WHERE company_id=$1',[company.company_id]);const depMap=new Map(departments.rows.map(d=>[d.lower_name,d.id]));const errors:{row:number;message:string}[]=[];let imported=0,updated=0;const client=await db.connect();const defaultPasswordHash=await bcrypt.hash('Employee@123',12)
  try{await client.query('BEGIN');for(let row=2;row<=sheet.rowCount;row++){
    const cell=(header:string)=>sheet.getRow(row).getCell(headers.get(header.toLowerCase())??0);const value=(header:string)=>String(cell(header).text??'').trim();const emptyDate=(text:string)=>['','-','--','—','–','n/a','na','nil','none','active','still working'].includes(text.trim().toLowerCase());const dateValue=(header:string)=>{const raw=cell(header).value;if(raw instanceof Date)return raw.toISOString().slice(0,10);if(typeof raw==='number'&&raw>20000){const excelDate=new Date(Math.round((raw-25569)*86400*1000));return excelDate.toISOString().slice(0,10)}const text=value(header).replace(/[–—]/g,'-').replace(/^'/,'').trim();if(emptyDate(text))return null;if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;const match=text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);if(match){const day=Number(match[1]),month=Number(match[2]),year=Number(match[3]);if(day>=1&&day<=31&&month>=1&&month<=12)return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`}return null};const numberValue=(header:string)=>{const text=value(header);if(text==='')return null;const parsed=Number(text);return Number.isFinite(parsed)?parsed:null};const yesNo=(header:string)=>{const text=value(header).toLowerCase();return ['yes','y','true','1'].includes(text)?true:['no','n','false','0'].includes(text)?false:null}
    const employeeNo=value('Employee ID'),nameEng=value('Employee Name (Eng)'),rawBusinessEmail=value('Business Email'),businessEmail=(rawBusinessEmail.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]??'').toLowerCase();if(!employeeNo&&!nameEng)continue;if(!employeeNo||!nameEng){errors.push({row,message:'Employee ID and Employee Name (Eng) are required'});continue}const department=value('Department');let departmentId=department?depMap.get(department.toLowerCase()):null;if(department&&!departmentId){const created=await client.query(`INSERT INTO departments(company_id,name,code) VALUES($1,$2,$3) RETURNING id`,[company.company_id,department,`IMP-${Date.now().toString().slice(-7)}-${row}`]);departmentId=created.rows[0].id;depMap.set(department.toLowerCase(),departmentId)}const dateHeaders=['DOB(Eng)','Join Date','Permanent Date','Resign/Retired/Terminate (Date)'];const invalidDate=dateHeaders.find(header=>!emptyDate(value(header))&&!dateValue(header));if(invalidDate){errors.push({row,message:`${invalidDate} must use YYYY-MM-DD, DD-MM-YYYY or DD/MM/YYYY`});continue}
    for(const [itemType,itemName] of [['organization',value('Organization')],['project_location',value('Project Location')]])if(itemName)await client.query(`INSERT INTO hr_master_items(company_id,item_type,name,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,item_type,name) DO UPDATE SET is_active=true,updated_at=now()`,[company.company_id,itemType,itemName,req.user!.id]);const managerText=value('Report To');const manager=managerText?(await client.query(`SELECT id FROM employees WHERE employee_no=$1 OR lower(trim(first_name||' '||last_name))=lower($1) LIMIT 1`,[managerText])).rows[0]:null;const internalEmail=businessEmail||`${employeeNo.toLowerCase().replace(/[^a-z0-9._-]/g,'')}@employee.local`;const existing=await client.query('SELECT id FROM employees WHERE employee_no=$1 OR lower(email)=lower($2)',[employeeNo,internalEmail]);const params=[company.company_id,departmentId??null,employeeNo,nameEng,value('Employee Name (MM)'),value('Position'),value('Organization'),value('Project Location'),value('NRC No (MM)'),value('NRC No (Eng)'),dateValue('DOB(Eng)'),numberValue('Age'),dateValue('Join Date'),dateValue('Permanent Date'),numberValue('Service Year'),value('Gender'),value('Blood Type'),value('Father Name'),value('Marital Status'),yesNo('Has Children'),numberValue('Number of Children'),value('Nationality'),value('Education'),value('Other Qualification'),value('Personal Phone No'),value('Business Phone No'),businessEmail||null,internalEmail,value('Current Address'),value('Probation/Permanent'),value('Branch'),dateValue('Resign/Retired/Terminate (Date)'),manager?.id??null,yesNo('Shift (Yes/No)'),value('Bank Account / Pay Number')]
    let employeeId:string;if(existing.rowCount){await client.query(`UPDATE employees SET company_id=$1,department_id=$2,employee_no=$3,first_name=$4,last_name='',name_mm=$5,position=$6,organization=$7,project_location=$8,work_location=$8,nrc_no_mm=$9,nrc_no_eng=$10,date_of_birth=$11,age=$12,joined_on=$13,permanent_date=$14,service_year=$15,gender=$16,blood_type=$17,father_name=$18,marital_status=$19,has_children=$20,number_of_children=$21,nationality=$22,education=$23,other_qualification=$24,phone=$25,business_phone_no=$26,business_email=$27,email=$28,current_address=$29,employment_type=$30,branch=$31,separation_date=$32,manager_id=$33,shift_required=$34,bank_account_pay_number=$35,updated_at=now() WHERE id=$36`,[...params,existing.rows[0].id]);employeeId=existing.rows[0].id;updated++}else{const inserted=await client.query(`INSERT INTO employees(company_id,department_id,employee_no,first_name,name_mm,position,organization,project_location,work_location,nrc_no_mm,nrc_no_eng,date_of_birth,age,joined_on,permanent_date,service_year,gender,blood_type,father_name,marital_status,has_children,number_of_children,nationality,education,other_qualification,phone,business_phone_no,business_email,email,current_address,employment_type,branch,separation_date,manager_id,shift_required,bank_account_pay_number) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35) RETURNING id`,params);employeeId=inserted.rows[0].id;imported++}await createEmployeeUser(client,employeeId,nameEng,internalEmail,defaultPasswordHash)
  }for(let row=2;row<=sheet.rowCount;row++){const rowValue=(header:string)=>String(sheet.getRow(row).getCell(headers.get(header.toLowerCase())??0).text??'').trim();const employeeNo=rowValue('Employee ID'),managerText=rowValue('Report To');if(employeeNo&&managerText)await client.query(`UPDATE employees target SET manager_id=manager.id FROM employees manager WHERE target.company_id=$3 AND manager.company_id=$3 AND target.employee_no=$1 AND target.id<>manager.id AND (manager.employee_no=$2 OR lower(trim(manager.first_name||' '||manager.last_name))=lower($2))`,[employeeNo,managerText,company.company_id])}await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  res.json({imported,updated,skipped:errors.length,errors:errors.slice(0,50)})
}))

app.get('/api/profile', auth, asyncRoute(async (req,res) => {
  const result=await db.query(`SELECT e.id,e.employee_no,e.first_name,e.last_name,e.email,e.phone,e.position,e.organization,e.project_location,e.work_location,e.employment_status,d.name department,m.first_name||' '||m.last_name manager,u.role FROM employees e JOIN users u ON u.employee_id=e.id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN employees m ON m.id=e.manager_id WHERE e.id=$1`,[req.user!.employeeId])
  res.json(result.rows[0])
}))

app.get('/api/users', auth, asyncRoute(async (req,res) => {
  if(req.user!.role!=='admin')return res.status(403).json({error:'Admin access required'})
  const result=await db.query(`SELECT u.id,u.email,u.username,u.role,u.is_active,u.last_login_at,u.created_at,e.employee_no,e.first_name,e.last_name,e.position,e.organization,e.project_location,d.name department,COALESCE(NULLIF(trim(m.first_name||' '||m.last_name),''),m.employee_no) report_to,'********' password_mask FROM users u LEFT JOIN employees e ON e.id=u.employee_id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN employees m ON m.id=e.manager_id ORDER BY u.created_at DESC`)
  res.json(result.rows)
}))

app.post('/api/users/:id/reset-password',auth,asyncRoute(async(req,res)=>{
  if(req.user!.role!=='admin')return res.status(403).json({error:'Admin access required'});const input=z.object({newPassword:z.string().min(8).max(128),confirmPassword:z.string().min(8).max(128)}).refine(value=>value.newPassword===value.confirmPassword,{message:'Passwords do not match'}).parse(req.body);const hash=await bcrypt.hash(input.newPassword,12);const result=await db.query('UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING id',[hash,req.params.id]);if(!result.rowCount)return res.status(404).json({error:'User not found'});res.json({message:'Password reset successfully'})
}))

app.patch('/api/users/:id', auth, asyncRoute(async (req,res) => {
  if(req.user!.role!=='admin')return res.status(403).json({error:'Admin access required'})
  const input=z.object({role:z.enum(['admin','hr','manager','approver','employee']).optional(),isActive:z.boolean().optional()}).parse(req.body)
  const result=await db.query(`UPDATE users SET role=COALESCE($1,role),is_active=COALESCE($2,is_active) WHERE id=$3 RETURNING id,email,role,is_active`,[input.role??null,input.isActive??null,req.params.id])
  res.json(result.rows[0])
}))

app.post('/api/employees', auth, asyncRoute(async (req,res) => {
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'})
  const optional=z.string().max(2000).optional().default('');const input=z.object({employeeNo:z.string().min(2).max(30),nameEng:z.string().min(1).max(180),nameMm:optional,position:optional,department:optional,organization:optional,projectLocation:optional,nrcNoMm:optional,nrcNoEng:optional,dob:optional,age:optional,joinDate:optional,permanentDate:optional,serviceYear:optional,gender:optional,bloodType:optional,fatherName:optional,maritalStatus:optional,hasChildren:optional,numberOfChildren:optional,nationality:optional,education:optional,otherQualification:optional,personalPhone:optional,businessPhone:optional,businessEmail:optional,currentAddress:optional,employmentType:optional,branch:optional,separationDate:optional,reportTo:optional,shiftRequired:optional,bankAccountPayNumber:optional}).parse(req.body)
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const department=input.department?(await db.query('SELECT id FROM departments WHERE company_id=$1 AND lower(name)=lower($2)',[company.company_id,input.department])).rows[0]:null;if(input.department&&!department)return res.status(400).json({error:`Unknown department: ${input.department}`})
  const manager=input.reportTo?(await db.query(`SELECT id FROM employees WHERE company_id=$1 AND (employee_no=$2 OR lower(trim(first_name||' '||last_name))=lower($2)) LIMIT 1`,[company.company_id,input.reportTo])).rows[0]:null;const email=input.businessEmail||`${input.employeeNo.toLowerCase().replace(/[^a-z0-9._-]/g,'')}@employee.local`;if(input.businessEmail&&!/^\S+@\S+\.\S+$/.test(input.businessEmail))return res.status(400).json({error:'Business Email is invalid'})
  const number=(value:string)=>value===''?null:Number(value);const date=(value:string)=>value||null;const yesNo=(value:string)=>value==='Yes'?true:value==='No'?false:null
  const params=[company.company_id,department?.id??null,input.employeeNo,input.nameEng,input.nameMm,input.position,input.organization,input.projectLocation,input.nrcNoMm,input.nrcNoEng,date(input.dob),number(input.age),date(input.joinDate),date(input.permanentDate),number(input.serviceYear),input.gender,input.bloodType,input.fatherName,input.maritalStatus,yesNo(input.hasChildren),number(input.numberOfChildren),input.nationality,input.education,input.otherQualification,input.personalPhone,input.businessPhone,input.businessEmail||null,email,input.currentAddress,input.employmentType,input.branch,date(input.separationDate),manager?.id??null,yesNo(input.shiftRequired),input.bankAccountPayNumber]
  const result=await db.query(`INSERT INTO employees(company_id,department_id,employee_no,first_name,name_mm,position,organization,project_location,work_location,nrc_no_mm,nrc_no_eng,date_of_birth,age,joined_on,permanent_date,service_year,gender,blood_type,father_name,marital_status,has_children,number_of_children,nationality,education,other_qualification,phone,business_phone_no,business_email,email,current_address,employment_type,branch,separation_date,manager_id,shift_required,bank_account_pay_number) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35) RETURNING *`,params)
  await createEmployeeUser(db,result.rows[0].id,input.nameEng,email,await bcrypt.hash('Employee@123',12))
  res.status(201).json(result.rows[0])
}))

app.get('/api/employees/:id',auth,asyncRoute(async(req,res)=>{
  const privileged=['admin','hr','manager'].includes(req.user!.role);const result=await db.query(`SELECT e.*,d.name department,COALESCE(NULLIF(trim(m.first_name||' '||m.last_name),''),m.employee_no) report_to,to_char(e.date_of_birth,'YYYY-MM-DD') date_of_birth,to_char(e.joined_on,'YYYY-MM-DD') joined_on,to_char(e.permanent_date,'YYYY-MM-DD') permanent_date,to_char(e.separation_date,'YYYY-MM-DD') separation_date,CASE WHEN e.date_of_birth IS NOT NULL THEN EXTRACT(YEAR FROM age(CURRENT_DATE,e.date_of_birth))::int END age,CASE WHEN e.joined_on IS NOT NULL THEN round((CURRENT_DATE-e.joined_on)::numeric/365.2425,2) END service_year FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN employees m ON m.id=e.manager_id WHERE e.id=$1 AND ($2::boolean OR e.id=$3)`,[req.params.id,privileged,req.user!.employeeId]);if(!result.rowCount)return res.status(404).json({error:'Employee not found'});res.json(result.rows[0])
}))

app.put('/api/employees/:id',auth,asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const optional=z.string().max(2000).optional().default('');const input=z.object({employeeNo:z.string().min(2).max(30),nameEng:z.string().min(1).max(180),nameMm:optional,position:optional,department:optional,organization:optional,projectLocation:optional,nrcNoMm:optional,nrcNoEng:optional,dob:optional,age:optional,joinDate:optional,permanentDate:optional,serviceYear:optional,gender:optional,bloodType:optional,fatherName:optional,maritalStatus:optional,hasChildren:optional,numberOfChildren:optional,nationality:optional,education:optional,otherQualification:optional,personalPhone:optional,businessPhone:optional,businessEmail:optional,currentAddress:optional,employmentType:optional,branch:optional,separationDate:optional,reportTo:optional,shiftRequired:optional,bankAccountPayNumber:optional}).parse(req.body);const current=(await db.query('SELECT company_id,email FROM employees WHERE id=$1',[req.params.id])).rows[0];if(!current)return res.status(404).json({error:'Employee not found'});const department=input.department?(await db.query('SELECT id FROM departments WHERE company_id=$1 AND lower(name)=lower($2)',[current.company_id,input.department])).rows[0]:null;if(input.department&&!department)return res.status(400).json({error:`Unknown department: ${input.department}`});const manager=input.reportTo?(await db.query(`SELECT id FROM employees WHERE company_id=$1 AND id<>$3 AND (employee_no=$2 OR lower(trim(first_name||' '||last_name))=lower($2)) LIMIT 1`,[current.company_id,input.reportTo,req.params.id])).rows[0]:null;if(input.businessEmail&&!/^\S+@\S+\.\S+$/.test(input.businessEmail))return res.status(400).json({error:'Business Email is invalid'});const number=(value:string)=>value===''?null:Number(value);const date=(value:string)=>value||null;const yesNo=(value:string)=>value==='Yes'?true:value==='No'?false:null;const email=input.businessEmail||current.email;const values=[department?.id??null,input.employeeNo,input.nameEng,input.nameMm,input.position,input.organization,input.projectLocation,input.nrcNoMm,input.nrcNoEng,date(input.dob),number(input.age),date(input.joinDate),date(input.permanentDate),number(input.serviceYear),input.gender,input.bloodType,input.fatherName,input.maritalStatus,yesNo(input.hasChildren),number(input.numberOfChildren),input.nationality,input.education,input.otherQualification,input.personalPhone,input.businessPhone,input.businessEmail||null,email,input.currentAddress,input.employmentType,input.branch,date(input.separationDate),manager?.id??null,yesNo(input.shiftRequired),input.bankAccountPayNumber,req.params.id];const result=await db.query(`UPDATE employees SET department_id=$1,employee_no=$2,first_name=$3,last_name='',name_mm=$4,position=$5,organization=$6,project_location=$7,work_location=$7,nrc_no_mm=$8,nrc_no_eng=$9,date_of_birth=$10,age=$11,joined_on=$12,permanent_date=$13,service_year=$14,gender=$15,blood_type=$16,father_name=$17,marital_status=$18,has_children=$19,number_of_children=$20,nationality=$21,education=$22,other_qualification=$23,phone=$24,business_phone_no=$25,business_email=$26,email=$27,current_address=$28,employment_type=$29,branch=$30,separation_date=$31,manager_id=$32,shift_required=$33,bank_account_pay_number=$34,updated_at=now() WHERE id=$35 RETURNING *`,values);await createEmployeeUser(db,req.params.id,input.nameEng,email,await bcrypt.hash('Employee@123',12));res.json(result.rows[0])
}))

app.get('/api/departments', auth, asyncRoute(async (_req,res) => {
  const result=await db.query('SELECT id,name,code FROM departments WHERE is_active=true ORDER BY name')
  res.json(result.rows)
}))

app.get('/api/item-master',auth,asyncRoute(async(req,res)=>{
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const [departments,items]=await Promise.all([db.query(`SELECT id,'department' item_type,name,is_active FROM departments WHERE company_id=$1 AND is_active=true`,[company.company_id]),db.query(`SELECT id,item_type,name,is_active FROM hr_master_items WHERE company_id=$1 AND is_active=true`,[company.company_id])]);res.json([...departments.rows,...items.rows].sort((a,b)=>a.name.localeCompare(b.name)))
}))

app.post('/api/item-master',auth,asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const input=z.object({itemType:z.enum(['department','organization','project_location']),name:z.string().min(2).max(180)}).parse(req.body);const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];if(input.itemType==='department'){const code=`D${Date.now().toString().slice(-7)}`;const result=await db.query(`INSERT INTO departments(company_id,name,code) VALUES($1,$2,$3) ON CONFLICT(company_id,code) DO UPDATE SET is_active=true RETURNING id,'department' item_type,name,is_active`,[company.company_id,input.name,code]);return res.status(201).json(result.rows[0])}const result=await db.query(`INSERT INTO hr_master_items(company_id,item_type,name,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,item_type,name) DO UPDATE SET is_active=true,updated_at=now() RETURNING *`,[company.company_id,input.itemType,input.name,req.user!.id]);res.status(201).json(result.rows[0])
}))

app.delete('/api/item-master/:type/:id',auth,asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const type=z.enum(['department','organization','project_location']).parse(req.params.type);if(type==='department'){await db.query('UPDATE departments SET is_active=false WHERE id=$1',[req.params.id])}else await db.query('UPDATE hr_master_items SET is_active=false,updated_at=now() WHERE id=$1 AND item_type=$2',[req.params.id,type]);res.json({message:'Item removed'})
}))

app.get('/api/attendance', auth, asyncRoute(async (req,res) => {
  const date=typeof req.query.date==='string'?req.query.date:null
  const privileged=['admin','hr','manager','approver'].includes(req.user!.role)
  const result=await db.query(`SELECT a.id,a.work_date,a.check_in,a.check_out,a.status,a.source,e.employee_no,e.first_name,e.last_name,d.name department FROM attendance a JOIN employees e ON e.id=a.employee_id LEFT JOIN departments d ON d.id=e.department_id WHERE a.work_date=COALESCE($1::date,CURRENT_DATE) AND ($2::boolean OR a.employee_id=$3) ORDER BY a.check_in`,[date,privileged,req.user!.employeeId])
  res.json(result.rows)
}))

app.get('/api/attendance/today', auth, asyncRoute(async (req,res) => {
  const result=await db.query(`SELECT id,work_date,check_in,check_out,status FROM attendance WHERE employee_id=$1 AND work_date=CURRENT_DATE`,[req.user!.employeeId])
  res.json(result.rows[0]??null)
}))

app.get('/api/requests', auth, asyncRoute(async (req,res) => {
  const status=typeof req.query.status==='string'?req.query.status:'pending'
  const type=typeof req.query.type==='string'?req.query.type:null
  const privileged=['admin','hr','manager','approver'].includes(req.user!.role)
  const result=await db.query(`SELECT r.id,r.request_type,r.title,r.reason,r.start_at,r.end_at,r.payload,r.status,r.created_at,e.first_name,e.last_name,e.employee_no FROM requests r JOIN employees e ON e.id=r.employee_id WHERE ($1::text IS NULL OR r.status=$1) AND ($2::text IS NULL OR r.request_type=$2) AND ($3::boolean OR r.employee_id=$4) ORDER BY r.created_at DESC`,[status==='all'?null:status,type,privileged,req.user!.employeeId])
  res.json(result.rows)
}))

app.get('/api/my-requests',auth,asyncRoute(async(req,res)=>{
  const result=await db.query(`
    SELECT r.id,r.id::text request_id,r.request_type,r.title,r.reason description,CASE WHEN r.status='pending' THEN 'pending with '||COALESCE(NULLIF(trim(ae.first_name||' '||ae.last_name),''),au.username,'Unassigned approver') ELSE r.status END status,r.created_at,e.first_name,e.last_name,e.employee_no,d.name department,e.organization business_units,NULL::text payee,NULL::numeric amount,NULL::text currency,r.payload details,'hr' source
    FROM requests r JOIN employees e ON e.id=r.employee_id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN users au ON au.id=r.current_approver_id LEFT JOIN employees ae ON ae.id=au.employee_id WHERE r.employee_id=$1
    UNION ALL
    SELECT c.id,c.reference_no request_id,c.request_type,c.purpose title,c.purpose description,CASE WHEN c.status='pending' THEN 'pending with '||COALESCE(NULLIF(trim(pe.first_name||' '||pe.last_name),''),pu.username,'Unassigned approver') ELSE c.status END status,c.created_at,e.first_name,e.last_name,e.employee_no,d.name department,e.organization business_units,c.payee,c.amount,c.currency,c.details,'corporate' source
    FROM corporate_requests c JOIN employees e ON e.id=c.employee_id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN approval_workflow_steps aws ON aws.company_id=e.company_id AND aws.request_type=c.request_type AND aws.step_order=c.current_step LEFT JOIN users pu ON pu.id=aws.approver_user_id LEFT JOIN employees pe ON pe.id=pu.employee_id WHERE c.employee_id=$1
    ORDER BY created_at DESC
  `,[req.user!.employeeId]);res.json(result.rows)
}))

app.post('/api/requests', auth, asyncRoute(async (req,res) => {
  const input=z.object({requestType:z.enum(['leave','overtime','late_in','early_out','attendance_correction','appraisal']),title:z.string().min(3).max(180),reason:z.string().min(3).max(2000),startAt:z.iso.datetime().optional(),endAt:z.iso.datetime().optional(),payload:z.record(z.string(),z.unknown()).optional()}).parse(req.body)
  const approver=(await db.query(`SELECT id FROM users WHERE role IN ('manager','hr','admin') AND is_active=true ORDER BY CASE role WHEN 'manager' THEN 1 WHEN 'hr' THEN 2 ELSE 3 END LIMIT 1`)).rows[0]
  const result=await db.query(`INSERT INTO requests(employee_id,request_type,title,reason,start_at,end_at,payload,status,current_approver_id) VALUES($1,$2,$3,$4,$5,$6,$7,'pending',$8) RETURNING *`,[req.user!.employeeId,input.requestType,input.title,input.reason,input.startAt??null,input.endAt??null,input.payload??{},approver?.id??null])
  if(approver)await db.query(`INSERT INTO notifications(user_id,title,message,notification_type,resource_type,resource_id) VALUES($1,'New approval request',$2,'approval','request',$3)`,[approver.id,input.title,result.rows[0].id])
  await db.query(`INSERT INTO notifications(user_id,title,message,notification_type,resource_type,resource_id) VALUES($1,'Request submitted',$2,'request_status','request',$3)`,[req.user!.id,`${input.title} is pending approval.`,result.rows[0].id])
  res.status(201).json(result.rows[0])
}))

app.post('/api/requests/:id/action', auth, asyncRoute(async (req,res) => {
  if(!['admin','hr','manager','approver'].includes(req.user!.role))return res.status(403).json({error:'Approver access required'})
  const input=z.object({action:z.enum(['approved','rejected']),comment:z.string().max(1000).optional()}).parse(req.body)
  const client=await db.connect()
  try { await client.query('BEGIN'); const updated=await client.query(`UPDATE requests SET status=$1,updated_at=now() WHERE id=$2 AND status='pending' RETURNING *`,[input.action,req.params.id]); if(!updated.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'Request is no longer pending'})}; await client.query(`INSERT INTO approval_actions(request_id,approver_id,action,comment) VALUES($1,$2,$3,$4)`,[req.params.id,req.user!.id,input.action,input.comment]); const owner=await client.query('SELECT u.id FROM users u JOIN requests r ON r.employee_id=u.employee_id WHERE r.id=$1',[req.params.id]); if(owner.rows[0])await client.query(`INSERT INTO notifications(user_id,title,message,notification_type,resource_type,resource_id) VALUES($1,$2,$3,'request_status','request',$4)`,[owner.rows[0].id,`Request ${input.action}`,input.comment??`Your request was ${input.action}.`,req.params.id]); await client.query('COMMIT'); res.json(updated.rows[0]) } catch(e){await client.query('ROLLBACK');throw e} finally{client.release()}
}))

app.post('/api/attendance/check-in', auth, asyncRoute(async (req,res) => {
  const input=z.object({latitude:z.number().min(-90).max(90).optional(),longitude:z.number().min(-180).max(180).optional()}).parse(req.body)
  const result=await db.query(`INSERT INTO attendance(employee_id,work_date,check_in,check_in_lat,check_in_lng,status) VALUES($1,CURRENT_DATE,now(),$2,$3,CASE WHEN localtime > time '09:00' THEN 'late' ELSE 'present' END) ON CONFLICT(employee_id,work_date) DO UPDATE SET check_in=COALESCE(attendance.check_in,excluded.check_in),check_in_lat=COALESCE(attendance.check_in_lat,excluded.check_in_lat),check_in_lng=COALESCE(attendance.check_in_lng,excluded.check_in_lng),updated_at=now() RETURNING *`,[req.user!.employeeId,input.latitude,input.longitude])
  res.status(201).json(result.rows[0])
}))

app.post('/api/attendance/check-out', auth, asyncRoute(async (req,res) => {
  const input=z.object({latitude:z.number().min(-90).max(90).optional(),longitude:z.number().min(-180).max(180).optional()}).parse(req.body)
  const result=await db.query(`UPDATE attendance SET check_out=now(),check_out_lat=$2,check_out_lng=$3,updated_at=now() WHERE employee_id=$1 AND work_date=CURRENT_DATE AND check_in IS NOT NULL RETURNING *`,[req.user!.employeeId,input.latitude,input.longitude])
  if(!result.rowCount)return res.status(409).json({error:'Check in first'}); res.json(result.rows[0])
}))

app.get('/api/announcements', auth, permit('Announcements'),asyncRoute(async (_req,res) => {
  const result=await db.query(`SELECT a.id,a.title,a.body,a.published_at,a.created_at,d.name department,u.email created_by,COALESCE((SELECT json_agg(json_build_object('id',aa.id,'name',aa.original_name,'mimeType',aa.mime_type,'size',aa.file_size) ORDER BY aa.created_at) FROM announcement_attachments aa WHERE aa.announcement_id=a.id),'[]') attachments FROM announcements a LEFT JOIN departments d ON d.id=a.department_id LEFT JOIN users u ON u.id=a.created_by ORDER BY COALESCE(a.published_at,a.created_at) DESC`)
  res.json(result.rows)
}))

app.post('/api/announcements', auth,permit('Announcements'),asyncRoute(async (req,res) => {
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'})
  const input=z.object({title:z.string().min(3).max(200),body:z.string().min(3).max(10000),publish:z.boolean().default(true)}).parse(req.body)
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const result=await db.query(`INSERT INTO announcements(company_id,title,body,published_at,created_by) VALUES($1,$2,$3,CASE WHEN $4 THEN now() ELSE NULL END,$5) RETURNING *`,[company.company_id,input.title,input.body,input.publish,req.user!.id])
  res.status(201).json(result.rows[0])
}))

app.get('/api/reports/summary', auth, asyncRoute(async (_req,res) => {
  const result=await db.query(`SELECT
    (SELECT count(*) FROM employees WHERE employment_status='active')::int employees,
    (SELECT count(*) FROM attendance WHERE work_date=CURRENT_DATE)::int attendance_today,
    (SELECT count(*) FROM requests WHERE request_type='leave')::int leave_requests,
    (SELECT count(*) FROM requests WHERE request_type='overtime')::int overtime_requests,
    (SELECT count(*) FROM requests WHERE status='approved')::int approved_requests,
    (SELECT count(*) FROM requests WHERE status='pending')::int pending_requests`)
  res.json(result.rows[0])
}))

app.get('/api/reports/export', auth, asyncRoute(async (req,res) => {
  const type=typeof req.query.type==='string'?req.query.type:'attendance'
  const queries:Record<string,string>={
    attendance:`SELECT a.work_date,e.employee_no,trim(e.first_name||' '||e.last_name) employee_name,d.name department,a.check_in,a.check_out,a.status,a.source FROM attendance a JOIN employees e ON e.id=a.employee_id LEFT JOIN departments d ON d.id=e.department_id ORDER BY a.work_date DESC,e.employee_no`,
    leave:`SELECT e.employee_no,trim(e.first_name||' '||e.last_name) employee_name,d.name department,r.title,r.reason,r.start_at,r.end_at,r.status,r.created_at submitted_at FROM requests r JOIN employees e ON e.id=r.employee_id LEFT JOIN departments d ON d.id=e.department_id WHERE r.request_type='leave' ORDER BY r.created_at DESC`,
    overtime:`SELECT e.employee_no,trim(e.first_name||' '||e.last_name) employee_name,d.name department,r.title,r.reason,r.start_at,r.end_at,r.status,r.created_at submitted_at FROM requests r JOIN employees e ON e.id=r.employee_id LEFT JOIN departments d ON d.id=e.department_id WHERE r.request_type='overtime' ORDER BY r.created_at DESC`,
    approvals:`SELECT e.employee_no,trim(e.first_name||' '||e.last_name) employee_name,r.request_type,r.title,r.status,r.created_at submitted_at,r.updated_at last_updated FROM requests r JOIN employees e ON e.id=r.employee_id ORDER BY r.created_at DESC`
  }
  if(!queries[type])return res.status(400).json({error:'Unknown report type'})
  const result=await db.query(queries[type]);const workbook=new ExcelJS.Workbook();workbook.creator='Company Portal';const sheet=workbook.addWorksheet(`${type[0].toUpperCase()}${type.slice(1)} Report`,{views:[{state:'frozen',ySplit:1}]});const keys=result.fields.map(field=>field.name);sheet.columns=keys.map(key=>({key,header:key.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()),width:Math.max(16,Math.min(32,key.length+8))}));result.rows.forEach(row=>sheet.addRow(row));sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF6554DC'}}});sheet.autoFilter=`A1:${sheet.getColumn(keys.length).letter}1`;const buffer=await workbook.xlsx.writeBuffer();res.setHeader('Content-Disposition',`attachment; filename="${type}-report-${new Date().toISOString().slice(0,10)}.xlsx"`);res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buffer))
}))

app.get('/api/settings', auth, asyncRoute(async (req,res) => {
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'})
  const result=await db.query(`SELECT setting_key,setting_value,updated_at FROM system_settings WHERE company_id=(SELECT company_id FROM employees WHERE id=$1) ORDER BY setting_key`,[req.user!.employeeId])
  res.json(result.rows)
}))

app.put('/api/settings/:key', auth, asyncRoute(async (req,res) => {
  if(req.user!.role!=='admin')return res.status(403).json({error:'Admin access required'})
  const value=z.record(z.string(),z.unknown()).parse(req.body)
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const result=await db.query(`INSERT INTO system_settings(company_id,setting_key,setting_value,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,setting_key) DO UPDATE SET setting_value=$3,updated_by=$4,updated_at=now() RETURNING *`,[company.company_id,req.params.key,value,req.user!.id])
  res.json(result.rows[0])
}))

app.get('/api/branding',asyncRoute(async(_req,res)=>{
  const result=await db.query(`SELECT setting_value FROM system_settings WHERE setting_key='banner' ORDER BY updated_at DESC LIMIT 1`);res.json(result.rows[0]?.setting_value??{iconText:'CP',title:'Company Portal',subtitle:'People & Operations',iconColor:'#6d5ce7'})
}))

app.post('/api/branding/logo',auth,attachmentUpload.single('logo'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'Admin or HR access required'});if(!req.file||!req.file.mimetype.startsWith('image/'))return res.status(400).json({error:'A valid image file is required'});res.status(201).json({logoUrl:`/branding/logo/${req.file.filename}`})
}))

app.get('/api/branding/logo/:filename',asyncRoute(async(req,res)=>{
  const filename=String(req.params.filename);if(!/^[a-f0-9-]+\.(jpg|jpeg|png|webp|gif)$/i.test(filename))return res.status(400).json({error:'Invalid logo file'});res.sendFile(join(uploadDirectory,filename))
}))

app.get('/api/approval-setup',auth,asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'Admin or HR access required'});const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const [steps,users]=await Promise.all([db.query(`SELECT s.id,s.request_type,s.step_order,s.step_name,s.approver_user_id,u.username,trim(e.first_name||' '||e.last_name) approver_name,e.employee_no FROM approval_workflow_steps s LEFT JOIN users u ON u.id=s.approver_user_id LEFT JOIN employees e ON e.id=u.employee_id WHERE s.company_id=$1 ORDER BY s.request_type,s.step_order`,[company.company_id]),db.query(`SELECT u.id,u.username,u.role,e.employee_no,trim(e.first_name||' '||e.last_name) employee_name FROM users u JOIN employees e ON e.id=u.employee_id WHERE e.company_id=$1 AND u.is_active=true ORDER BY e.first_name,e.last_name`,[company.company_id])]);res.json({steps:steps.rows,users:users.rows})
}))

app.put('/api/approval-setup/:requestType',auth,asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'Admin or HR access required'});const requestType=z.enum(['payment','advance_clearance']).parse(req.params.requestType);const input=z.object({steps:z.array(z.object({stepOrder:z.number().int().min(1).max(20),stepName:z.string().min(2).max(120),approverUserId:z.uuid().nullable().optional()})).min(1).max(20)}).parse(req.body);const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const client=await db.connect();try{await client.query('BEGIN');for(const step of input.steps)await client.query(`INSERT INTO approval_workflow_steps(company_id,request_type,step_order,step_name,approver_user_id,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(company_id,request_type,step_order) DO UPDATE SET step_name=$4,approver_user_id=$5,updated_by=$6,updated_at=now()`,[company.company_id,requestType,step.stepOrder,step.stepName,step.approverUserId??null,req.user!.id]);await client.query('COMMIT');res.json({message:'Approval workflow saved successfully'})}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}))

app.get('/api/notifications', auth,permit('Notification'),asyncRoute(async (req,res) => {
  const result=await db.query(`SELECT id,title,message,notification_type,resource_type,resource_id,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,[req.user!.id])
  res.json(result.rows)
}))

app.patch('/api/notifications/:id/read', auth,permit('Notification'),asyncRoute(async (req,res) => {
  const result=await db.query(`UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING *`,[req.params.id,req.user!.id])
  res.json(result.rows[0])
}))

app.get('/api/notifications/unread-count',auth,permit('Notification'),asyncRoute(async(req,res)=>{
  const result=await db.query(`SELECT count(*)::int count FROM notifications WHERE user_id=$1 AND read_at IS NULL`,[req.user!.id]);res.json({count:result.rows[0].count})
}))

app.patch('/api/notifications/read-all',auth,permit('Notification'),asyncRoute(async(req,res)=>{
  const result=await db.query(`UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL RETURNING id`,[req.user!.id]);res.json({updated:result.rowCount})
}))

app.get('/api/me/navigation',auth,asyncRoute(async(req,res)=>{
  const result=await db.query(`SELECT rp.menu_key FROM role_permissions rp JOIN employees e ON e.company_id=rp.company_id WHERE e.id=$1 AND rp.role=$2 AND rp.allowed=true ORDER BY rp.menu_key`,[req.user!.employeeId,req.user!.role]);res.json({role:req.user!.role,menus:req.user!.role==='admin'?['*']:result.rows.map(row=>row.menu_key)})
}))

app.get('/api/permissions',auth,permit('Permission'),asyncRoute(async(req,res)=>{
  const result=await db.query(`SELECT rp.role,rp.menu_key,rp.allowed FROM role_permissions rp JOIN employees e ON e.company_id=rp.company_id WHERE e.id=$1 ORDER BY rp.role,rp.menu_key`,[req.user!.employeeId]);res.json(result.rows)
}))

app.put('/api/permissions',auth,permit('Permission'),asyncRoute(async(req,res)=>{
  const input=z.object({role:z.enum(['admin','hr','manager','approver','employee']),menuKey:z.string().min(2).max(60),allowed:z.boolean()}).parse(req.body);const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const result=await db.query(`INSERT INTO role_permissions(company_id,role,menu_key,allowed,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(company_id,role,menu_key) DO UPDATE SET allowed=$4,updated_by=$5,updated_at=now() RETURNING *`,[company.company_id,input.role,input.menuKey,input.allowed,req.user!.id]);res.json(result.rows[0])
}))

app.get('/api/corporate-requests',auth,asyncRoute(async(req,res)=>{
  const type=typeof req.query.type==='string'?req.query.type:null;const result=await db.query(`SELECT c.*,e.employee_no,trim(e.first_name||' '||e.last_name) employee_name FROM corporate_requests c JOIN employees e ON e.id=c.employee_id WHERE ($1::text IS NULL OR c.request_type=$1) AND (c.employee_id=$2 OR EXISTS(SELECT 1 FROM approval_workflow_steps aws WHERE aws.company_id=e.company_id AND aws.request_type=c.request_type AND aws.step_order=c.current_step AND aws.approver_user_id=$3)) ORDER BY c.created_at DESC`,[type,req.user!.employeeId,req.user!.id]);res.json(result.rows)
}))

app.get('/api/corporate-requests/:id',auth,asyncRoute(async(req,res)=>{
  const request=(await db.query(`SELECT c.*,e.company_id,e.employee_no,trim(e.first_name||' '||e.last_name) employee_name,d.name employee_department,e.organization business_units FROM corporate_requests c JOIN employees e ON e.id=c.employee_id LEFT JOIN departments d ON d.id=e.department_id WHERE c.id=$1`,[req.params.id])).rows[0];if(!request)return res.status(404).json({error:'Request not found'});const steps=(await db.query(`SELECT aws.step_order,aws.step_name,aws.approver_user_id,COALESCE(NULLIF(trim(e.first_name||' '||e.last_name),''),u.username) approver_name,u.username,a.action,a.comment,a.acted_at FROM approval_workflow_steps aws LEFT JOIN users u ON u.id=aws.approver_user_id LEFT JOIN employees e ON e.id=u.employee_id LEFT JOIN corporate_approval_actions a ON a.corporate_request_id=$3 AND a.step_order=aws.step_order WHERE aws.company_id=$1 AND aws.request_type=$2 ORDER BY aws.step_order`,[request.company_id,request.request_type,request.id])).rows;const isOwner=request.employee_id===req.user!.employeeId;const isWorkflowApprover=steps.some(step=>step.approver_user_id===req.user!.id);if(!isOwner&&!isWorkflowApprover)return res.status(403).json({error:'You can only view your own or assigned requests'});const attachments=(await db.query(`SELECT id,original_name,mime_type,file_size FROM corporate_request_attachments WHERE corporate_request_id=$1 ORDER BY created_at`,[request.id])).rows;const current=steps.find(step=>Number(step.step_order)===Number(request.current_step));res.json({request,steps,attachments,canAct:request.status==='pending'&&current?.approver_user_id===req.user!.id})
}))

app.post('/api/corporate-requests/:id/action',auth,asyncRoute(async(req,res)=>{
  const input=z.object({action:z.enum(['approved','rejected']),comment:z.string().max(1000).optional()}).parse(req.body)
  const client=await db.connect()
  try{
    await client.query('BEGIN')
    const request=(await client.query(`SELECT c.*,e.company_id FROM corporate_requests c JOIN employees e ON e.id=c.employee_id WHERE c.id=$1 FOR UPDATE`,[req.params.id])).rows[0]
    if(!request||request.status!=='pending'){await client.query('ROLLBACK');return res.status(409).json({error:'Request is no longer pending'})}
    const steps=(await client.query(`SELECT * FROM approval_workflow_steps WHERE company_id=$1 AND request_type=$2 ORDER BY step_order`,[request.company_id,request.request_type])).rows
    const current=steps.find(step=>Number(step.step_order)===Number(request.current_step))
    if(!current||current.approver_user_id!==req.user!.id){await client.query('ROLLBACK');return res.status(403).json({error:'This request is not assigned to you at the current approval step'})}
    await client.query(`INSERT INTO corporate_approval_actions(corporate_request_id,step_order,approver_user_id,action,comment) VALUES($1,$2,$3,$4,$5)`,[request.id,request.current_step,req.user!.id,input.action,input.comment??null])
    const lastStep=Math.max(...steps.map(step=>Number(step.step_order)))
    const nextStatus=input.action==='rejected'?'rejected':Number(request.current_step)>=lastStep?'approved':'pending'
    const nextStep=input.action==='approved'&&Number(request.current_step)<lastStep?Number(request.current_step)+1:Number(request.current_step)
    await client.query(`UPDATE corporate_requests SET status=$1,current_step=$2,approved_at=CASE WHEN $1='approved' THEN now() ELSE approved_at END,updated_at=now() WHERE id=$3`,[nextStatus,nextStep,request.id])
    const owner=(await client.query(`SELECT u.id FROM users u WHERE u.employee_id=$1`,[request.employee_id])).rows[0]
    const approver=(await client.query(`SELECT COALESCE(NULLIF(trim(e.first_name||' '||e.last_name),''),u.username) AS approver_name FROM users u LEFT JOIN employees e ON e.id=u.employee_id WHERE u.id=$1`,[req.user!.id])).rows[0]
    const next=nextStatus==='pending'?steps.find(step=>Number(step.step_order)===nextStep):null
    const nextApprover=next?.approver_user_id?(await client.query(`SELECT COALESCE(NULLIF(trim(e.first_name||' '||e.last_name),''),u.username) AS approver_name FROM users u LEFT JOIN employees e ON e.id=u.employee_id WHERE u.id=$1`,[next.approver_user_id])).rows[0]:null
    const title=`Payment Request Form (${request.reference_no})`
    const message=input.action==='rejected'?`Your payment request ${request.reference_no} was rejected by ${approver?.approver_name??'the approver'}.`:nextStatus==='pending'?`Your payment request ${request.reference_no} was approved by ${approver?.approver_name??'the approver'}. Your payment request is continued to ${nextApprover?.approver_name??'the next approver'}.`:`Your payment request ${request.reference_no} was approved by ${approver?.approver_name??'the approver'}. Your payment request is fully approved.`
    if(owner)await client.query(`INSERT INTO notifications(user_id,title,message,notification_type,resource_type,resource_id) VALUES($1,$2,$3,'request_status','corporate_request',$4)`,[owner.id,title,message,request.id])
    if(next?.approver_user_id)await client.query(`INSERT INTO notifications(user_id,title,message,notification_type,resource_type,resource_id) VALUES($1,'Payment approval required',$2,'approval','corporate_request',$3)`,[next.approver_user_id,`${request.reference_no} is waiting for your approval.`,request.id])
    await client.query('COMMIT')
    res.json({status:nextStatus,currentStep:nextStep})
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}))

app.post('/api/corporate-requests/:id/action-legacy',auth,asyncRoute(async(req,res)=>{
  const input=z.object({action:z.enum(['approved','rejected']),comment:z.string().max(1000).optional()}).parse(req.body);const client=await db.connect();try{await client.query('BEGIN');const request=(await client.query(`SELECT c.*,e.company_id FROM corporate_requests c JOIN employees e ON e.id=c.employee_id WHERE c.id=$1 FOR UPDATE`,[req.params.id])).rows[0];if(!request||request.status!=='pending'){await client.query('ROLLBACK');return res.status(409).json({error:'Request is no longer pending'})}const steps=(await client.query(`SELECT * FROM approval_workflow_steps WHERE company_id=$1 AND request_type=$2 ORDER BY step_order`,[request.company_id,request.request_type])).rows;const current=steps.find(step=>Number(step.step_order)===Number(request.current_step));if(!current||current.approver_user_id!==req.user!.id){await client.query('ROLLBACK');return res.status(403).json({error:'This request is not assigned to you at the current approval step'})}await client.query(`INSERT INTO corporate_approval_actions(corporate_request_id,step_order,approver_user_id,action,comment) VALUES($1,$2,$3,$4,$5)`,[request.id,request.current_step,req.user!.id,input.action,input.comment??null]);const lastStep=Math.max(...steps.map(step=>Number(step.step_order)));const nextStatus=input.action==='rejected'?'rejected':Number(request.current_step)>=lastStep?'approved':'pending';const nextStep=input.action==='approved'&&Number(request.current_step)<lastStep?Number(request.current_step)+1:Number(request.current_step);await client.query(`UPDATE corporate_requests SET status=$1,current_step=$2,approved_at=CASE WHEN $1='approved' THEN now() ELSE approved_at END,updated_at=now() WHERE id=$3`,[nextStatus,nextStep,request.id]);const owner=(await client.query(`SELECT u.id FROM users u WHERE u.employee_id=$1`,[request.employee_id])).rows[0];const approver=(await client.query(`SELECT COALESCE(NULLIF(trim(e.first_name||' '||e.last_name),''),u.username) name FROM users u LEFT JOIN employees e ON e.id=u.employee_id WHERE u.id=$1`,[req.user!.id])).rows[0];const next=nextStatus==='pending'?steps.find(step=>Number(step.step_order)===nextStep):null;const nextApprover=next?.approver_user_id?(await client.query(`SELECT COALESCE(NULLIF(trim(e.first_name||' '||e.last_name),''),u.username) name FROM users u LEFT JOIN employees e ON e.id=u.employee_id WHERE u.id=$1`,[next.approver_user_id])).rows[0]:null;const title=`Payment Request Form (${request.reference_no})`;const message=input.action==='rejected'?`Your payment request ${request.reference_no} was rejected by ${approver?.name??'the approver'}.`:nextStatus==='pending'?`Your payment request ${request.reference_no} was approved by ${approver?.name??'the approver'}. Your payment request is continued to ${nextApprover?.name??'the next approver'}.`:`Your payment request ${request.reference_no} was approved by ${approver?.name??'the approver'}. Your payment request is fully approved.`;if(owner)await client.query(`INSERT INTO notifications(user_id,title,message,notification_type,resource_type,resource_id) VALUES($1,$2,$3,'request_status','corporate_request',$4)`,[owner.id,title,message,request.id]);if(next?.approver_user_id)await client.query(`INSERT INTO notifications(user_id,title,message,notification_type,resource_type,resource_id) VALUES($1,'Payment approval required',$2,'approval','corporate_request',$3)`,[next.approver_user_id,`${request.reference_no} is waiting for your approval.`,request.id]);await client.query('COMMIT');res.json({status:nextStatus,currentStep:nextStep})}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}))

app.get('/api/corporate-requests/:id/attachments/:attachmentId',auth,asyncRoute(async(req,res)=>{
  const access=(await db.query(`SELECT c.id,e.company_id,c.employee_id,c.request_type FROM corporate_requests c JOIN employees e ON e.id=c.employee_id WHERE c.id=$1`,[req.params.id])).rows[0];if(!access)return res.status(404).json({error:'Request not found'});const allowed=access.employee_id===req.user!.employeeId||(await db.query(`SELECT 1 FROM approval_workflow_steps WHERE company_id=$1 AND request_type=$2 AND approver_user_id=$3 LIMIT 1`,[access.company_id,access.request_type,req.user!.id])).rowCount;if(!allowed)return res.status(403).json({error:'Attachment access denied'});const file=(await db.query(`SELECT * FROM corporate_request_attachments WHERE id=$1 AND corporate_request_id=$2`,[req.params.attachmentId,req.params.id])).rows[0];if(!file)return res.status(404).json({error:'Attachment not found'});res.type(file.mime_type);res.setHeader('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);res.sendFile(join(uploadDirectory,file.stored_name))
}))

app.post('/api/corporate-requests',auth,permit('Corporate'),attachmentUpload.array('attachments',5),asyncRoute(async(req,res)=>{
  const rawDetails=typeof req.body.details==='string'?JSON.parse(req.body.details):req.body.details;const input=z.object({requestType:z.enum(['payment','advance_clearance']),payee:z.string().max(180).optional().default(''),purpose:z.string().min(3).max(3000),amount:z.coerce.number().nonnegative(),currency:z.enum(['USD','EURO','CNY','MMK','THB']).default('MMK'),details:z.record(z.string(),z.unknown()).optional()}).parse({...req.body,details:rawDetails});const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const configuredApprover=(await db.query(`SELECT approver_user_id id FROM approval_workflow_steps WHERE company_id=$1 AND request_type=$2 AND step_order=1`,[company.company_id,input.requestType])).rows[0];const fallbackApprover=(await db.query(`SELECT id FROM users WHERE role IN ('manager','approver','hr','admin') AND is_active=true ORDER BY CASE role WHEN 'manager' THEN 1 WHEN 'approver' THEN 2 WHEN 'hr' THEN 3 ELSE 4 END LIMIT 1`)).rows[0];const approver=configuredApprover?.id?configuredApprover:fallbackApprover;const prefix=input.requestType==='payment'?'PAY':'ADV';const reference=`${prefix}-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`;const client=await db.connect();try{await client.query('BEGIN');const result=await client.query(`INSERT INTO corporate_requests(employee_id,request_type,reference_no,payee,purpose,amount,currency,details,approver_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[req.user!.employeeId,input.requestType,reference,input.payee,input.purpose,input.amount,input.currency,input.details??{},approver?.id??null]);for(const file of ((req.files as Express.Multer.File[] | undefined)??[]))await client.query(`INSERT INTO corporate_request_attachments(corporate_request_id,original_name,stored_name,mime_type,file_size) VALUES($1,$2,$3,$4,$5)`,[result.rows[0].id,file.originalname,file.filename,file.mimetype,file.size]);await client.query('COMMIT');res.status(201).json(result.rows[0])}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}))

app.post('/api/announcements/:id/attachments',auth,permit('Announcements'),attachmentUpload.array('files',5),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const files=(req.files as Express.Multer.File[])??[];const inserted=[];for(const file of files){const result=await db.query(`INSERT INTO announcement_attachments(announcement_id,original_name,stored_name,mime_type,file_size) VALUES($1,$2,$3,$4,$5) RETURNING *`,[req.params.id,file.originalname,file.filename,file.mimetype,file.size]);inserted.push(result.rows[0])}res.status(201).json(inserted)
}))

app.get('/api/announcements/:id/attachments/:attachmentId',auth,permit('Announcements'),asyncRoute(async(req,res)=>{
  const result=await db.query(`SELECT * FROM announcement_attachments WHERE id=$1 AND announcement_id=$2`,[req.params.attachmentId,req.params.id]);if(!result.rowCount)return res.status(404).json({error:'Attachment not found'});const file=result.rows[0];res.download(join(uploadDirectory,file.stored_name),file.original_name)
}))

app.use((error: unknown,_req: Request,res: Response,_next: NextFunction) => {
  if(error instanceof z.ZodError)return res.status(400).json({error:'Invalid request',details:error.issues})
  console.error(error); res.status(500).json({error:'Internal server error'})
})

const port=Number(process.env.PORT ?? 4000)
app.listen(port,()=>console.log(`Company Portal API running at http://localhost:${port}`))
