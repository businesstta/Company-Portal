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
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = randomUUID().slice(0, 8)
  const startedAt = process.hrtime.bigint()
  res.setHeader('X-Request-Id', requestId)
  console.log(`[API ${requestId}] -> ${req.method} ${req.originalUrl}`)

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
    const duration = `${durationMs >= 100 ? durationMs.toFixed(0) : durationMs.toFixed(1)}ms`
    const statusLabel = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : res.statusCode >= 300 ? 'REDIRECT' : 'OK'
    console.log(`[API ${requestId}] <- ${req.method} ${req.originalUrl} ${res.statusCode} ${statusLabel} ${duration}`)
  })

  next()
})
app.use(express.json({ limit: '1mb' }))

const auth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace(/^Bearer /, '')
  try { req.user = jwt.verify(token ?? '', process.env.JWT_SECRET!) as AuthRequest['user']; next() }
  catch { res.status(401).json({ error: 'Authentication required' }) }
}
const permit=(menuKey:string)=>async(req:AuthRequest,res:Response,next:NextFunction)=>{if(req.user?.role==='admin')return next();const result=await db.query(`SELECT 1 FROM role_permissions rp JOIN employees e ON e.company_id=rp.company_id WHERE e.id=$1 AND rp.role=$2 AND rp.menu_key=$3 AND rp.allowed=true`,[req.user!.employeeId,req.user!.role,menuKey]);if(!result.rowCount)return res.status(403).json({error:`Permission denied: ${menuKey}`});next()}
const hasMenuAccess=async(req:AuthRequest,menuKey:string)=>{if(req.user?.role==='admin')return true;const result=await db.query(`SELECT 1 FROM role_permissions rp JOIN employees e ON e.company_id=rp.company_id WHERE e.id=$1 AND rp.role=$2 AND rp.menu_key=$3 AND rp.allowed=true`,[req.user!.employeeId,req.user!.role,menuKey]);return (result.rowCount??0)>0}
const permitCorporateRequest=async(req:AuthRequest,res:Response,next:NextFunction)=>{if(req.user?.role==='admin')return next();const requestType=String(req.query.type??req.body?.requestType??'');const menuKeys=requestType==='payment'?['Corporate','Payment Request Form','Payment Request']:requestType==='advance_clearance'?['Corporate','Advance Clearance Request Form','Advance Clearance']:requestType==='vehicle_request'?['Corporate','Vehicle Request Form','Vehicle Request']:['Corporate'];const result=await db.query(`SELECT 1 FROM role_permissions rp JOIN employees e ON e.company_id=rp.company_id WHERE e.id=$1 AND rp.role=$2 AND rp.menu_key=ANY($3::text[]) AND rp.allowed=true LIMIT 1`,[req.user!.employeeId,req.user!.role,menuKeys]);if(!result.rowCount)return res.status(403).json({error:`Permission denied: ${menuKeys[1]??menuKeys[0]}`});next()}
const asyncRoute = (fn: (req: AuthRequest,res: Response)=>Promise<unknown>) => (req: AuthRequest,res: Response,next: NextFunction) => Promise.resolve(fn(req,res)).catch(next)
const employeeUsername=(name:string)=>name.trim().toLowerCase().replace(/\s+/g,' ')
const roleKeyFromName=(name:string)=>name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,30)
const createEmployeeUser=async(query:{query:(text:string,values?:unknown[])=>Promise<{rows:Record<string,unknown>[];rowCount:number|null}>},employeeId:string|string[],name:string,email:string,passwordHash:string)=>{
  const normalizedEmployeeId=String(employeeId);const base=employeeUsername(name);let username=base;let suffix=2
  while((await query.query('SELECT 1 FROM users WHERE lower(username)=lower($1) AND employee_id<>$2',[username,normalizedEmployeeId])).rowCount)username=`${base} ${suffix++}`
  await query.query(`INSERT INTO users(employee_id,email,username,password_hash,role) VALUES($1,$2,$3,$4,'employee') ON CONFLICT(employee_id) DO UPDATE SET username=EXCLUDED.username,email=EXCLUDED.email`,[normalizedEmployeeId,email,username,passwordHash])
}
const corporateApprovalStepsSql=`SELECT aws.step_order,aws.step_name,CASE WHEN aws.request_type IN ('payment','advance_clearance','vehicle_request') AND aws.step_order=1 THEN COALESCE(report_to_user.id,aws.approver_user_id) ELSE aws.approver_user_id END approver_user_id,COALESCE(CASE WHEN aws.request_type IN ('payment','advance_clearance','vehicle_request') AND aws.step_order=1 THEN COALESCE(NULLIF(trim(report_to_employee.first_name||' '||report_to_employee.last_name),''),report_to_user.username) END,NULLIF(trim(fixed_employee.first_name||' '||fixed_employee.last_name),''),fixed_user.username) approver_name,COALESCE(CASE WHEN aws.request_type IN ('payment','advance_clearance','vehicle_request') AND aws.step_order=1 THEN report_to_user.username END,fixed_user.username) username,a.action,a.comment,a.acted_at FROM approval_workflow_steps aws JOIN employees requester ON requester.id=$4 LEFT JOIN employees report_to_employee ON report_to_employee.id=requester.manager_id LEFT JOIN users report_to_user ON report_to_user.employee_id=report_to_employee.id AND report_to_user.is_active=true LEFT JOIN users fixed_user ON fixed_user.id=aws.approver_user_id LEFT JOIN employees fixed_employee ON fixed_employee.id=fixed_user.employee_id LEFT JOIN corporate_approval_actions a ON a.corporate_request_id=$3 AND a.step_order=aws.step_order WHERE aws.company_id=$1 AND aws.request_type=$2 ORDER BY aws.step_order`
const getCorporateApprovalSteps=async(query:{query:(text:string,values?:unknown[])=>Promise<{rows:Record<string,unknown>[]}>},request:Record<string,unknown>)=>(await query.query(corporateApprovalStepsSql,[request.company_id,request.request_type,request.id,request.employee_id])).rows
const detailsRecord=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
const isTransportationStep=(step:Record<string,unknown>|undefined)=>String(step?.step_name??'').toLowerCase().includes('transportation')
const assignedVehicleFrom=(details:Record<string,unknown>)=>detailsRecord(details.assignedVehicle)

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
  if(_req.user!.role==='employee'){const [attendance,pending]=await Promise.all([db.query(`SELECT status FROM attendance WHERE employee_id=$1 AND work_date=CURRENT_DATE`,[_req.user!.employeeId]),db.query(`SELECT ((SELECT count(*) FROM requests WHERE employee_id=$1 AND status='pending')+(SELECT count(*) FROM corporate_requests WHERE employee_id=$1 AND status='pending'))::int total`,[_req.user!.employeeId])]);const status=attendance.rows[0]?.status;return res.json({stats:{totalEmployees:1,presentToday:status==='present'?1:0,lateToday:status==='late'?1:0,pendingApprovals:pending.rows[0].total},departments:[]})}
  const [employees,attendance,pending,departments]=await Promise.all([
    db.query(`SELECT count(*)::int total FROM employees WHERE employment_status='active'`),
    db.query(`SELECT count(*) FILTER(WHERE status='present')::int present,count(*) FILTER(WHERE status='late')::int late,count(*)::int recorded FROM attendance WHERE work_date=CURRENT_DATE`),
    db.query(`SELECT ((SELECT count(*) FROM requests WHERE status='pending')+(SELECT count(*) FROM corporate_requests c JOIN employees e ON e.id=c.employee_id JOIN approval_workflow_steps aws ON aws.company_id=e.company_id AND aws.request_type=c.request_type AND aws.step_order=c.current_step LEFT JOIN employees rte ON rte.id=e.manager_id LEFT JOIN users rtu ON rtu.employee_id=rte.id AND rtu.is_active=true WHERE c.status='pending' AND (CASE WHEN aws.request_type IN ('payment','advance_clearance','vehicle_request') AND aws.step_order=1 THEN COALESCE(rtu.id,aws.approver_user_id) ELSE aws.approver_user_id END)=$1))::int total`,[_req.user!.id]),
    db.query(`SELECT min(trim(d.name)) AS department_name,count(DISTINCT e.id)::int employees,count(DISTINCT a.employee_id) FILTER(WHERE a.status IN ('present','late'))::int present FROM employees e JOIN departments d ON d.id=e.department_id LEFT JOIN attendance a ON a.employee_id=e.id AND a.work_date=CURRENT_DATE WHERE e.employment_status='active' AND e.employee_no NOT LIKE 'EMP-%' AND nullif(trim(d.name),'') IS NOT NULL GROUP BY lower(trim(d.name)) ORDER BY min(trim(d.name))`)
  ])
  const total=employees.rows[0].total
  res.json({stats:{totalEmployees:total,presentToday:attendance.rows[0].present,lateToday:attendance.rows[0].late,pendingApprovals:pending.rows[0].total},departments:departments.rows.map(d=>({name:d.department_name,employees:d.employees,present:d.present,rate:d.employees?Math.round(d.present/d.employees*100):0}))})
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

app.get('/api/roles', auth, asyncRoute(async (req,res) => {
  if(req.user!.role!=='admin')return res.status(403).json({error:'Admin access required'})
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const result=await db.query(`SELECT role_key,role_name,is_system FROM user_roles WHERE company_id=$1 ORDER BY is_system DESC,CASE role_key WHEN 'admin' THEN 1 WHEN 'hr' THEN 2 WHEN 'manager' THEN 3 WHEN 'approver' THEN 4 WHEN 'employee' THEN 5 ELSE 99 END,role_name`,[company.company_id])
  res.json(result.rows)
}))

app.post('/api/roles', auth, asyncRoute(async (req,res) => {
  if(req.user!.role!=='admin')return res.status(403).json({error:'Admin access required'})
  const input=z.object({roleName:z.string().min(2).max(80)}).parse(req.body)
  const roleName=input.roleName.trim().replace(/\s+/g,' ')
  const roleKey=roleKeyFromName(roleName)
  if(!/^[a-z][a-z0-9_]{1,29}$/.test(roleKey))return res.status(400).json({error:'Role name must start with a letter and include letters or numbers.'})
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const client=await db.connect()
  try{
    await client.query('BEGIN')
    const created=await client.query(`INSERT INTO user_roles(company_id,role_key,role_name,created_by) VALUES($1,$2,$3,$4) RETURNING role_key,role_name,is_system`,[company.company_id,roleKey,roleName,req.user!.id])
    const menuKeys=['Overview','Approvals','Announcements','Notification','Human Resource','Employees','Attendance','Leave','Overtime','Appraisals','Corporate','Payment Request Form','Advance Clearance Request Form','Material Request Form','Service Request Form','Stationary Request Form','Vehicle Request Form','Fleet Management','Vehicle Management (Internal)','Vehicle Management (Maintenance)','Ferry Management','Information Technology','Admin','Reports','HR Management','Attendance Report','Leave Report','Overtime Report','Appraisals Report','Travelling Request Report','Asset Management','Admin Asset Report','IT Asset Report','Corporate Services','Payment Request Report','Advance Clearance Report','Service Request Report','Material Request Report','Stationary Request Report','Vehicle Request Report','Users & Roles','Role Access Control','Approval Setup','General Setting','Item Master','Banner','Settings','My Requests']
    for(const menuKey of menuKeys)await client.query(`INSERT INTO role_permissions(company_id,role,menu_key,allowed,updated_by) VALUES($1,$2,$3,false,$4) ON CONFLICT(company_id,role,menu_key) DO NOTHING`,[company.company_id,roleKey,menuKey,req.user!.id])
    await client.query('COMMIT')
    res.status(201).json(created.rows[0])
  }catch(error){
    await client.query('ROLLBACK')
    if(String((error as {code?:string}).code)==='23505')return res.status(409).json({error:'This role already exists.'})
    throw error
  }finally{client.release()}
}))

app.post('/api/users/:id/reset-password',auth,asyncRoute(async(req,res)=>{
  if(req.user!.role!=='admin')return res.status(403).json({error:'Admin access required'});const input=z.object({newPassword:z.string().min(8).max(128),confirmPassword:z.string().min(8).max(128)}).refine(value=>value.newPassword===value.confirmPassword,{message:'Passwords do not match'}).parse(req.body);const hash=await bcrypt.hash(input.newPassword,12);const result=await db.query('UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING id',[hash,req.params.id]);if(!result.rowCount)return res.status(404).json({error:'User not found'});res.json({message:'Password reset successfully'})
}))

app.patch('/api/users/:id', auth, asyncRoute(async (req,res) => {
  if(req.user!.role!=='admin')return res.status(403).json({error:'Admin access required'})
  const input=z.object({role:z.string().min(2).max(30).regex(/^[a-z][a-z0-9_]*$/).optional(),isActive:z.boolean().optional()}).parse(req.body)
  if(input.role){const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const roleExists=await db.query('SELECT 1 FROM user_roles WHERE company_id=$1 AND role_key=$2',[company.company_id,input.role]);if(!roleExists.rowCount)return res.status(400).json({error:'Unknown role'})}
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

const ferryTownships=['Ahlone','Botahtaung','Dagon Seikkan','Dawbon','East Dagon (Dagon Myothit East)','Hlaing','Hlaingthaya','Hmawbi','Insein','Kamayut','Kyauktada','Kyimyindaing','Lanmadaw','Latha','Mayangone','Mingala Taungnyunt','Mingaladon','North Dagon (Dagon Myothit North)','North Okkalapa','Sanchaung','Shwepyitha','South Dagon (Dagon Myothit South)','South Okkalapa','Tamwe','Thaketa','Thingangyun','Yankin'] as const
const normalizeFerryTownship=(input:string)=>{
  const normalized=input.trim().replace(/\s+/g,' ').toLowerCase().replace(/ township$/,'')
  const aliases:Record<string,string>={'north oakkalapa':'North Okkalapa','north okkalapa':'North Okkalapa','south oakkalapa':'South Okkalapa','south okkalapa':'South Okkalapa','tarmwe':'Tamwe','tamwe':'Tamwe'}
  return aliases[normalized]??ferryTownships.find(township=>township.toLowerCase()===normalized)??''
}
const nullableCoordinate=z.preprocess(value=>value===''||value===null||value===undefined?null:value,z.coerce.number().min(-180).max(180).nullable())
const nullableTime=z.preprocess(value=>value===''||value===null||value===undefined?null:value,z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/).nullable())
const ferryInputSchema=z.object({
  employeeId:z.string().uuid(),
  contactPhoneNumber:z.string().max(60).optional().default(''),
  vehicleNumber:z.string().max(80).optional().default(''),
  ferryPoint:z.string().max(180).optional().default(''),
  ferryPickupPoint:z.string().max(300).optional().default(''),
  pickupLatitude:nullableCoordinate,
  pickupLongitude:nullableCoordinate,
  ferryDropPoint:z.string().max(300).optional().default(''),
  dropLatitude:nullableCoordinate,
  dropLongitude:nullableCoordinate,
  township:z.enum(ferryTownships),
  address:z.string().max(2000).optional().default(''),
  officeAddress:z.string().max(2000).optional().default(''),
  officeLatitude:nullableCoordinate,
  officeLongitude:nullableCoordinate,
  driverName:z.string().max(180).optional().default(''),
  driverPhoneNumber:z.string().max(60).optional().default(''),
  pickupTime:nullableTime,
  dropTime:nullableTime,
  way:z.string().max(120).optional().default(''),
  point:z.string().max(120).optional().default(''),
  arrivalTime:nullableTime,
  remark:z.string().max(3000).optional().default('')
})
const ferryPatchSchema=ferryInputSchema.partial()
const ferryColumns=[
  ['Employee Name (Myanmar)','employee_name_myanmar',25],['Employee Name (English)','employee_name_english',25],['Employee ID','employee_no',16],
  ['Business Units','business_units',22],['Department','department',22],['Contact Phone Number','contact_phone_number',20],['Vehicle Number','vehicle_number',18],
  ['Ferry Point','ferry_point',20],['Ferry Pickup Point','ferry_pickup_point',28],['Lattitude (Ferry Pickup Point)','pickup_latitude',24],
  ['Longitude (Ferry Pickup Point)','pickup_longitude',24],['Ferry Drop Point','ferry_drop_point',28],['Lattitude (Drop Point)','drop_latitude',22],
  ['Longitude (Drop Point)','drop_longitude',22],['Township','township',28],['Address','address',35],
  ['Office Address','office_address',35],['Office Lattitude','office_latitude',20],['Office Longitude','office_longitude',20],
  ['Driver Name','driver_name',24],['Driver Phone Number','driver_phone_number',22],['Pickup Time','pickup_time',15],
  ['Drop Time','drop_time',15],['Way','way',16],['Point','point',16],['Arrival Time','arrival_time',15],['Remark','remark',35]
] as [string,string,number][]
const ferryWorkbook=async(rows?:Record<string,unknown>[])=>{
  const workbook=new ExcelJS.Workbook();workbook.creator='Company Portal';const sheet=workbook.addWorksheet('Ferry Records',{views:[{state:'frozen',ySplit:1,xSplit:3}]})
  sheet.columns=ferryColumns.map(([header,key,width])=>({header,key,width}))
  sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF6554DC'}};cell.alignment={vertical:'middle',wrapText:true}});sheet.getRow(1).height=36;sheet.autoFilter=`A1:${sheet.getColumn(sheet.columnCount).letter}1`
  if(rows!==undefined)rows.forEach(row=>sheet.addRow(row));else sheet.addRow({employee_no:'EMP-0001',contact_phone_number:'09xxxxxxxxx',vehicle_number:'YGN-1234',ferry_point:'Point A',ferry_pickup_point:'Pickup location',township:'Yankin',pickup_time:'07:30',drop_time:'08:30',way:'To Office',point:'1',arrival_time:'08:30'})
  sheet.getColumn('employee_no').numFmt='@';sheet.getColumn('contact_phone_number').numFmt='@';sheet.getColumn('vehicle_number').numFmt='@';sheet.getColumn('driver_phone_number').numFmt='@'
  const lists=workbook.addWorksheet('Lists',{state:'veryHidden'});ferryTownships.forEach((township,index)=>{lists.getCell(index+1,1).value=township})
  sheet.getColumn('township').eachCell((cell,row)=>{if(row>1)cell.dataValidation={type:'list',allowBlank:false,formulae:[`Lists!$A$1:$A$${ferryTownships.length}`]}})
  const instructions=workbook.addWorksheet('Instructions');instructions.columns=[{width:34},{width:95}];instructions.addRows([['Field','Instructions'],['Employee ID','Optional. The value is imported directly from Excel; Employee Master matching is not required.'],['Township','Choose one of: '+ferryTownships.join(', ')+'. Other non-empty values are also preserved as entered.'],['Vehicle Number','Vehicle Number, Ferry Car Number, Ferry Vehicle Number, Vehicle No and Car Number headers are accepted.'],['Office fields','Office Address, Office Lattitude and Office Longitude are optional and imported directly from Excel.'],['Driver fields','Driver Name and Driver Phone Number are optional and imported directly from Excel.'],['Time fields','Use HH:MM in 24-hour format or include AM/PM.'],['Latitude / Longitude','Use decimal coordinates, for example 16.8409 and 96.1735.'],['Import notes','Every non-empty row is imported directly from Excel. Employee names and organization details are not replaced with Employee Master values.']]);instructions.getRow(1).font={bold:true}
  return workbook
}
const ferrySelectSql=`SELECT f.id,f.employee_id,COALESCE(NULLIF(f.employee_name_myanmar,''),e.name_mm,'') employee_name_myanmar,COALESCE(NULLIF(f.employee_name_english,''),NULLIF(trim(e.first_name||' '||e.last_name),''),'') employee_name_english,COALESCE(NULLIF(f.employee_no,''),e.employee_no,'') employee_no,COALESCE(NULLIF(f.business_units,''),e.organization,'') business_units,COALESCE(NULLIF(f.department,''),d.name,'') department,f.contact_phone_number,f.vehicle_number,f.ferry_point,f.ferry_pickup_point,f.pickup_latitude,f.pickup_longitude,f.ferry_drop_point,f.drop_latitude,f.drop_longitude,f.township,f.address,f.office_address,f.office_latitude,f.office_longitude,f.driver_name,f.driver_phone_number,to_char(f.pickup_time,'HH24:MI') pickup_time,to_char(f.drop_time,'HH24:MI') drop_time,f.way,f.point,to_char(f.arrival_time,'HH24:MI') arrival_time,f.remark,f.created_at,f.updated_at FROM ferry_records f LEFT JOIN employees e ON e.id=f.employee_id LEFT JOIN departments d ON d.id=e.department_id`
const ferryVehicleInputSchema=z.object({vehicleName:z.string().min(1).max(180),vehicleType:z.string().max(120).optional().default(''),vehicleNumber:z.string().min(1).max(80),driverName:z.string().max(180).optional().default(''),driverPhoneNumber:z.string().max(60).optional().default('')})
const ferryVehicleColumns=[['Vehicle Name','vehicle_name',25],['Vehicle Type','vehicle_type',20],['Vehicle Number','vehicle_number',20],['Driver Name','driver_name',25],['Driver Phone Number','driver_phone_number',22]] as [string,string,number][]
const ferryVehicleWorkbook=async(rows?:Record<string,unknown>[])=>{
  const workbook=new ExcelJS.Workbook();workbook.creator='Company Portal';const sheet=workbook.addWorksheet('Ferry Vehicles',{views:[{state:'frozen',ySplit:1}]})
  sheet.columns=ferryVehicleColumns.map(([header,key,width])=>({header,key,width}))
  sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF6554DC'}};cell.alignment={vertical:'middle',wrapText:true}});sheet.getRow(1).height=32;sheet.autoFilter=`A1:${sheet.getColumn(sheet.columnCount).letter}1`
  if(rows!==undefined)rows.forEach(row=>sheet.addRow(row));else sheet.addRow({vehicle_name:'Example Ferry',vehicle_type:'Mini Bus',vehicle_number:'YGN-1234',driver_name:'Driver Name',driver_phone_number:'09xxxxxxxxx'})
  sheet.getColumn('vehicle_number').numFmt='@';sheet.getColumn('driver_phone_number').numFmt='@'
  const instructions=workbook.addWorksheet('Instructions');instructions.columns=[{width:30},{width:90}];instructions.addRows([['Field','Instructions'],['Vehicle Name','Required'],['Vehicle Number','Required and unique. Existing Vehicle Numbers are updated during import.'],['Driver Phone Number','Formatted as text to preserve leading zeroes.'],['Import notes','Do not rename the Ferry Vehicles sheet or headers. Remove the example row before entering real data.']]);instructions.getRow(1).font={bold:true}
  return workbook
}

app.get('/api/ferries',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'Ferry Management'))return res.status(403).json({error:'Permission denied: Ferry Management'})
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const result=await db.query(`${ferrySelectSql} WHERE f.company_id=$1 AND f.is_active=true ORDER BY f.created_at DESC`,[company.company_id]);res.json(result.rows)
}))
app.get('/api/ferries/employees',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'Ferry Management'))return res.status(403).json({error:'Permission denied: Ferry Management'})
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const result=await db.query(`SELECT e.id,e.employee_no,e.name_mm employee_name_myanmar,trim(e.first_name||' '||e.last_name) employee_name_english,e.organization business_units,d.name department,COALESCE(NULLIF(e.business_phone_no,''),e.phone,'') contact_phone_number FROM employees e LEFT JOIN departments d ON d.id=e.department_id WHERE e.company_id=$1 AND e.employment_status='active' ORDER BY e.employee_no`,[company.company_id]);res.json(result.rows)
}))
app.get('/api/ferries/template',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'Ferry Management'))return res.status(403).json({error:'Permission denied: Ferry Management'})
  const buffer=await (await ferryWorkbook()).xlsx.writeBuffer();res.setHeader('Content-Disposition','attachment; filename="ferry-record-import-template.xlsx"');res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buffer))
}))
app.get('/api/ferries/export',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'Ferry Management'))return res.status(403).json({error:'Permission denied: Ferry Management'})
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const exportFields:Record<string,string>={employee_name_myanmar:'employee_name_myanmar',employee_name_english:'employee_name_english',employee_no:'employee_no',department:'department',business_units:'business_units',vehicle_number:'vehicle_number',township:'township',point:'point'}
  const params:unknown[]=[company.company_id];const conditions:string[]=[]
  for(const [queryKey,column] of Object.entries(exportFields)){const queryValue=typeof req.query[queryKey]==='string'?req.query[queryKey].trim():'';if(queryValue){params.push(`%${queryValue}%`);conditions.push(`CAST(ferry_export.${column} AS text) ILIKE $${params.length}`)}}
  const requestedSort=typeof req.query.sortKey==='string'?req.query.sortKey:'';const sortColumn=exportFields[requestedSort]??'created_at';const sortDirection=req.query.sortDirection==='desc'?'DESC':'ASC';const filteredWhere=conditions.length?`WHERE ${conditions.join(' AND ')}`:''
  const result=await db.query(`SELECT * FROM (${ferrySelectSql} WHERE f.company_id=$1 AND f.is_active=true) ferry_export ${filteredWhere} ORDER BY ferry_export.${sortColumn} ${sortDirection},ferry_export.created_at DESC`,params)
  const buffer=await (await ferryWorkbook(result.rows)).xlsx.writeBuffer();res.setHeader('Content-Disposition',`attachment; filename="ferry-records-${new Date().toISOString().slice(0,10)}.xlsx"`);res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buffer))
}))
app.post('/api/ferries/import',auth,upload.single('file'),asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'Ferry Management'))return res.status(403).json({error:'Permission denied: Ferry Management'});if(!req.file)return res.status(400).json({error:'An .xlsx file is required'})
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(req.file.buffer as unknown as ExcelJS.Buffer);const sheet=workbook.getWorksheet('Ferry Records')??workbook.worksheets[0];if(!sheet)return res.status(400).json({error:'Ferry Records worksheet not found'})
  const normalizeHeader=(input:unknown)=>String(input??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')
  const headers=new Map<string,number>();sheet.getRow(1).eachCell((cell,col)=>headers.set(normalizeHeader(cell.value),col))
  const cellText=(cell:ExcelJS.Cell)=>{const raw=cell.value as unknown;if(raw===null||raw===undefined)return '';if(typeof raw==='object'){const data=raw as {result?:unknown;richText?:{text:string}[];text?:unknown};if(data.result!==null&&data.result!==undefined)return String(data.result).trim();if(Array.isArray(data.richText))return data.richText.map(part=>part.text).join('').trim();if(data.text!==null&&data.text!==undefined)return String(data.text).trim()}return String(cell.text||raw).trim()}
  const columnFor=(...aliases:string[])=>aliases.map(alias=>headers.get(normalizeHeader(alias))).find((item):item is number=>item!==undefined)
  const cellFor=(row:number,...aliases:string[])=>{const column=columnFor(...aliases);return column?sheet.getRow(row).getCell(column):null}
  const value=(row:number,...aliases:string[])=>{const cell=cellFor(row,...aliases);return cell?cellText(cell):''}
  const fuzzyValue=(row:number,...tokenGroups:string[][])=>{const match=[...headers.entries()].find(([header])=>tokenGroups.every(group=>group.some(token=>header.includes(token))));return match?cellText(sheet.getRow(row).getCell(match[1])):''}
  const fuzzyNameValue=(row:number,language:'myanmar'|'english')=>{const markers=language==='myanmar'?['myanmar','burmese',' mm']:['english',' eng'];const marked=[...headers.entries()].find(([header])=>header.includes('name')&&markers.some(marker=>` ${header} `.includes(marker)));if(marked)return cellText(sheet.getRow(row).getCell(marked[1]));const generic=[...headers.entries()].find(([header])=>['name','employee name','full name'].includes(header));if(!generic)return '';const text=cellText(sheet.getRow(row).getCell(generic[1]));const isMyanmar=/[\u1000-\u109f\uaa60-\uaa7f]/.test(text);const wantsMyanmar=language==='myanmar';return wantsMyanmar===isMyanmar?text:''}
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];let imported=0,updated=0,namesFromExcel=0,namesFilledFromEmployee=0;const client=await db.connect()
  try{
    await client.query('BEGIN')
    for(let row=2;row<=sheet.rowCount;row++){
      const employeeNo=value(row,'Employee ID','Employee No','Employee Number')
      const excelNameMyanmar=value(row,'Employee Name (Myanmar)','Full Name (Myanmar)','Employee Name (MM)','Employee Name MM','Full Name Myanmar','Employee Name Myanmar','Name (Myanmar)','Name Myanmar','Myanmar Name','Name (MM)','Name MM','Burmese Name')||fuzzyNameValue(row,'myanmar')
      const excelNameEnglish=value(row,'Employee Name (English)','Full Name (English)','Employee Name (Eng)','Employee Name Eng','Full Name English','Employee Name English','Name (English)','Name English','English Name','Name (Eng)','Name Eng')||fuzzyNameValue(row,'english')
      const contactPhone=value(row,'Contact Phone Number','Phone Number','Phone No')
      const pickupPoint=value(row,'Ferry Pickup Point','Pickup Point')
      const vehicleNumber=value(row,'Vehicle Number','Vehicle No','Vehicle No.','Ferry Car Number','Ferry Car No','Ferry Car No.','Ferry Vehicle Number','Ferry Vehicle No','Ferry Vehicle No.','Ferry Number','Ferry No','Ferry No.','Car Number','Car No','Car No.','Bus Number','Bus No','Bus No.')
      const townshipInput=value(row,'Township')
      if(!employeeNo&&!excelNameMyanmar&&!excelNameEnglish&&!contactPhone&&!pickupPoint&&!vehicleNumber&&!townshipInput)continue
      const township=normalizeFerryTownship(townshipInput)||townshipInput
      const coordinateText=(text:string)=>!text?null:Number.isFinite(Number(text))?text:null
      const coordinate=(...aliases:string[])=>coordinateText(value(row,...aliases))
      const time=(...aliases:string[])=>{const cell=cellFor(row,...aliases);if(!cell)return null;const raw=cell.value as unknown;if(raw instanceof Date)return `${String(raw.getUTCHours()).padStart(2,'0')}:${String(raw.getUTCMinutes()).padStart(2,'0')}`;if(typeof raw==='number'){const minutes=Math.round((raw-Math.floor(raw))*24*60)%(24*60);return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`}const text=cellText(cell).trim();const match=text.match(/^(\d{1,2}):(\d{2})(?::?\s*(\d{2}))?\s*:?[ ]*(AM|PM)?/i);if(!match)return null;let hour=Number(match[1]);const suffix=match[4]?.toUpperCase();if(suffix==='PM'&&hour<12)hour+=12;if(suffix==='AM'&&hour===12)hour=0;if(hour>23)return null;return `${String(hour).padStart(2,'0')}:${match[2]}`}
      const fallbackEmployee=employeeNo&&(!excelNameMyanmar||!excelNameEnglish)?(await client.query(`SELECT e.name_mm employee_name_myanmar,trim(e.first_name||' '||e.last_name) employee_name_english FROM employees e WHERE e.company_id=$1 AND lower(trim(e.employee_no))=lower(trim($2)) LIMIT 1`,[company.company_id,employeeNo])).rows[0]:null
      const employeeNameMyanmar=excelNameMyanmar||String(fallbackEmployee?.employee_name_myanmar??'')
      const employeeNameEnglish=excelNameEnglish||String(fallbackEmployee?.employee_name_english??'')
      if(excelNameMyanmar||excelNameEnglish)namesFromExcel++
      else if(employeeNameMyanmar||employeeNameEnglish)namesFilledFromEmployee++
      const businessUnits=value(row,'Business Units','Business Unit','Organization')
      const department=value(row,'Department','Dept','Dept;')
      const storedEmployeeNo=employeeNo
      const pickupTime=time('Pickup Time','Pick Time','Pick-up Time')
      const officeAddress=value(row,'Office Address','Office Location Address','Office Location')||fuzzyValue(row,['office'],['address','location'])
      const officeLatitude=coordinateText(value(row,'Office Lattitude','Office Latitude','Lattitude (Office)','Latitude (Office)','Office Location Lattitude','Office Location Latitude')||fuzzyValue(row,['office'],['lattitude','latitude']))
      const officeLongitude=coordinateText(value(row,'Office Longitude','Longitude (Office)','Office Location Longitude')||fuzzyValue(row,['office'],['longitude']))
      const recordValues=[null,employeeNameMyanmar,employeeNameEnglish,storedEmployeeNo,businessUnits,department,contactPhone,vehicleNumber,value(row,'Ferry Point'),pickupPoint,coordinate('Lattitude (Ferry Pickup Point)','Latitude (Ferry Pickup Point)','Lattitude (Pickup Point)','Latitude (Pickup Point)'),coordinate('Longitude (Ferry Pickup Point)','Longitude (Pickup Point)'),value(row,'Ferry Drop Point','Drop Point'),coordinate('Lattitude (Drop Point)','Latitude (Drop Point)','Lattitude (Ferry Drop Point)','Latitude (Ferry Drop Point)'),coordinate('Longitude (Drop Point)','Longitude (Ferry Drop Point)'),township,value(row,'Address','Full Address'),officeAddress,officeLatitude,officeLongitude,value(row,'Driver Name'),value(row,'Driver Phone Number','Driver Phone','Driver Phone No'),pickupTime,time('Drop Time'),value(row,'Way'),value(row,'Point'),time('Arrival Time'),value(row,'Remark')]
      let existingId:string|undefined
      if(storedEmployeeNo)existingId=(await client.query(`SELECT id FROM ferry_records WHERE company_id=$1 AND lower(trim(employee_no))=lower(trim($2)) AND lower(trim(vehicle_number))=lower(trim($3)) AND lower(trim(ferry_pickup_point))=lower(trim($4)) AND (pickup_time IS NULL OR COALESCE(to_char(pickup_time,'HH24:MI'),'')=COALESCE($5,'')) AND is_active=true ORDER BY (COALESCE(to_char(pickup_time,'HH24:MI'),'')=COALESCE($5,'')) DESC,created_at DESC LIMIT 1`,[company.company_id,storedEmployeeNo,vehicleNumber,pickupPoint,pickupTime])).rows[0]?.id
      else if(employeeNameEnglish)existingId=(await client.query(`SELECT id FROM ferry_records WHERE company_id=$1 AND lower(trim(employee_name_english))=lower(trim($2)) AND contact_phone_number=$3 AND lower(trim(vehicle_number))=lower(trim($4)) AND lower(trim(ferry_pickup_point))=lower(trim($5)) AND (pickup_time IS NULL OR COALESCE(to_char(pickup_time,'HH24:MI'),'')=COALESCE($6,'')) AND is_active=true ORDER BY (COALESCE(to_char(pickup_time,'HH24:MI'),'')=COALESCE($6,'')) DESC,created_at DESC LIMIT 1`,[company.company_id,employeeNameEnglish,contactPhone,vehicleNumber,pickupPoint,pickupTime])).rows[0]?.id
      else if(employeeNameMyanmar)existingId=(await client.query(`SELECT id FROM ferry_records WHERE company_id=$1 AND trim(employee_name_myanmar)=trim($2) AND contact_phone_number=$3 AND lower(trim(vehicle_number))=lower(trim($4)) AND lower(trim(ferry_pickup_point))=lower(trim($5)) AND (pickup_time IS NULL OR COALESCE(to_char(pickup_time,'HH24:MI'),'')=COALESCE($6,'')) AND is_active=true ORDER BY (COALESCE(to_char(pickup_time,'HH24:MI'),'')=COALESCE($6,'')) DESC,created_at DESC LIMIT 1`,[company.company_id,employeeNameMyanmar,contactPhone,vehicleNumber,pickupPoint,pickupTime])).rows[0]?.id
      if(!existingId&&contactPhone)existingId=(await client.query(`SELECT id FROM ferry_records WHERE company_id=$1 AND regexp_replace(contact_phone_number,'\\D','','g')=regexp_replace($2,'\\D','','g') AND lower(trim(vehicle_number))=lower(trim($3)) AND lower(trim(ferry_pickup_point))=lower(trim($4)) AND (pickup_time IS NULL OR COALESCE(to_char(pickup_time,'HH24:MI'),'')=COALESCE($5,'')) AND is_active=true ORDER BY (COALESCE(to_char(pickup_time,'HH24:MI'),'')=COALESCE($5,'')) DESC,created_at DESC LIMIT 1`,[company.company_id,contactPhone,vehicleNumber,pickupPoint,pickupTime])).rows[0]?.id
      if(existingId){await client.query(`UPDATE ferry_records SET employee_id=$1,employee_name_myanmar=$2,employee_name_english=$3,employee_no=$4,business_units=$5,department=$6,contact_phone_number=$7,vehicle_number=$8,ferry_point=$9,ferry_pickup_point=$10,pickup_latitude=$11,pickup_longitude=$12,ferry_drop_point=$13,drop_latitude=$14,drop_longitude=$15,township=$16,address=$17,office_address=$18,office_latitude=$19,office_longitude=$20,driver_name=$21,driver_phone_number=$22,pickup_time=$23,drop_time=$24,way=$25,point=$26,arrival_time=$27,remark=$28,updated_at=now() WHERE id=$29`,[...recordValues,existingId]);updated++}
      else{await client.query(`INSERT INTO ferry_records(company_id,employee_id,employee_name_myanmar,employee_name_english,employee_no,business_units,department,contact_phone_number,vehicle_number,ferry_point,ferry_pickup_point,pickup_latitude,pickup_longitude,ferry_drop_point,drop_latitude,drop_longitude,township,address,office_address,office_latitude,office_longitude,driver_name,driver_phone_number,pickup_time,drop_time,way,point,arrival_time,remark,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)`,[company.company_id,...recordValues,req.user!.id]);imported++}
    }
    await client.query('COMMIT')
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  res.json({imported,updated,skipped:0,namesFromExcel,namesFilledFromEmployee,errors:[]})
}))
app.post('/api/ferries',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'Ferry Management'))return res.status(403).json({error:'Permission denied: Ferry Management'});const input=ferryInputSchema.parse(req.body);const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const employee=await db.query('SELECT 1 FROM employees WHERE id=$1 AND company_id=$2 AND employment_status=$3',[input.employeeId,company.company_id,'active']);if(!employee.rowCount)return res.status(400).json({error:'Selected employee was not found'})
  const result=await db.query(`INSERT INTO ferry_records(company_id,employee_id,contact_phone_number,vehicle_number,ferry_point,ferry_pickup_point,pickup_latitude,pickup_longitude,ferry_drop_point,drop_latitude,drop_longitude,township,address,office_address,office_latitude,office_longitude,driver_name,driver_phone_number,pickup_time,drop_time,way,point,arrival_time,remark,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING id`,[company.company_id,input.employeeId,input.contactPhoneNumber,input.vehicleNumber,input.ferryPoint,input.ferryPickupPoint,input.pickupLatitude,input.pickupLongitude,input.ferryDropPoint,input.dropLatitude,input.dropLongitude,input.township,input.address,input.officeAddress,input.officeLatitude,input.officeLongitude,input.driverName,input.driverPhoneNumber,input.pickupTime,input.dropTime,input.way,input.point,input.arrivalTime,input.remark,req.user!.id]);res.status(201).json(result.rows[0])
}))
app.put('/api/ferries/:id',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'Ferry Management'))return res.status(403).json({error:'Permission denied: Ferry Management'});const input=ferryPatchSchema.parse(req.body);const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  if(input.employeeId){const employee=await db.query('SELECT 1 FROM employees WHERE id=$1 AND company_id=$2 AND employment_status=$3',[input.employeeId,company.company_id,'active']);if(!employee.rowCount)return res.status(400).json({error:'Selected employee was not found'})}
  const fieldMap:Record<string,string>={employeeId:'employee_id',contactPhoneNumber:'contact_phone_number',vehicleNumber:'vehicle_number',ferryPoint:'ferry_point',ferryPickupPoint:'ferry_pickup_point',pickupLatitude:'pickup_latitude',pickupLongitude:'pickup_longitude',ferryDropPoint:'ferry_drop_point',dropLatitude:'drop_latitude',dropLongitude:'drop_longitude',township:'township',address:'address',officeAddress:'office_address',officeLatitude:'office_latitude',officeLongitude:'office_longitude',driverName:'driver_name',driverPhoneNumber:'driver_phone_number',pickupTime:'pickup_time',dropTime:'drop_time',way:'way',point:'point',arrivalTime:'arrival_time',remark:'remark'}
  const changes=Object.entries(fieldMap).filter(([key])=>Object.prototype.hasOwnProperty.call(input,key)).map(([key,column])=>({column,value:(input as Record<string,unknown>)[key]}))
  if(!changes.length){const existing=await db.query('SELECT id FROM ferry_records WHERE id=$1 AND company_id=$2 AND is_active=true',[req.params.id,company.company_id]);if(!existing.rowCount)return res.status(404).json({error:'Ferry record not found'});return res.json(existing.rows[0])}
  const assignments=changes.map((change,index)=>`${change.column}=$${index+1}`).join(',');const values=changes.map(change=>change.value);const result=await db.query(`UPDATE ferry_records SET ${assignments},updated_at=now() WHERE id=$${values.length+1} AND company_id=$${values.length+2} AND is_active=true RETURNING id`,[...values,req.params.id,company.company_id]);if(!result.rowCount)return res.status(404).json({error:'Ferry record not found'});res.json(result.rows[0])
}))
app.delete('/api/ferries',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'Ferry Management'))return res.status(403).json({error:'Permission denied: Ferry Management'})
  const input=z.object({ids:z.array(z.string().uuid()).min(1).max(2000)}).parse(req.body)
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const result=await db.query('UPDATE ferry_records SET is_active=false,updated_at=now() WHERE company_id=$1 AND id=ANY($2::uuid[]) AND is_active=true RETURNING id',[company.company_id,input.ids])
  res.json({removed:result.rowCount})
}))
app.delete('/api/ferries/:id',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'Ferry Management'))return res.status(403).json({error:'Permission denied: Ferry Management'});const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const result=await db.query('UPDATE ferry_records SET is_active=false,updated_at=now() WHERE id=$1 AND company_id=$2 AND is_active=true RETURNING id',[req.params.id,company.company_id]);if(!result.rowCount)return res.status(404).json({error:'Ferry record not found'});res.json({message:'Ferry record deleted'})
}))
app.get('/api/ferry-vehicles',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'Ferry Management'))return res.status(403).json({error:'Permission denied: Ferry Management'});const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const result=await db.query('SELECT id,vehicle_name,vehicle_type,vehicle_number,driver_name,driver_phone_number,created_at,updated_at FROM ferry_vehicles WHERE company_id=$1 AND is_active=true ORDER BY created_at DESC',[company.company_id]);res.json(result.rows)
}))
app.get('/api/ferry-vehicles/template',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'Ferry Management'))return res.status(403).json({error:'Permission denied: Ferry Management'});const buffer=await (await ferryVehicleWorkbook()).xlsx.writeBuffer();res.setHeader('Content-Disposition','attachment; filename="ferry-vehicle-import-template.xlsx"');res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buffer))
}))
app.get('/api/ferry-vehicles/export',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'Ferry Management'))return res.status(403).json({error:'Permission denied: Ferry Management'});const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const result=await db.query('SELECT vehicle_name,vehicle_type,vehicle_number,driver_name,driver_phone_number FROM ferry_vehicles WHERE company_id=$1 AND is_active=true ORDER BY created_at DESC',[company.company_id]);const buffer=await (await ferryVehicleWorkbook(result.rows)).xlsx.writeBuffer();res.setHeader('Content-Disposition',`attachment; filename="ferry-vehicles-${new Date().toISOString().slice(0,10)}.xlsx"`);res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buffer))
}))
app.post('/api/ferry-vehicles/import',auth,upload.single('file'),asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'Ferry Management'))return res.status(403).json({error:'Permission denied: Ferry Management'});if(!req.file)return res.status(400).json({error:'An .xlsx file is required'})
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(req.file.buffer as unknown as ExcelJS.Buffer);const sheet=workbook.getWorksheet('Ferry Vehicles')??workbook.worksheets[0];if(!sheet)return res.status(400).json({error:'Ferry Vehicles worksheet not found'})
  const headers=new Map<string,number>();sheet.getRow(1).eachCell((cell,col)=>headers.set(String(cell.value).trim().toLowerCase(),col));const required=ferryVehicleColumns.map(([header])=>header.toLowerCase());const missing=required.filter(header=>!headers.has(header));if(missing.length)return res.status(400).json({error:`Missing columns: ${missing.join(', ')}`})
  const value=(row:number,header:string)=>{const column=headers.get(header.toLowerCase());return column?String(sheet.getRow(row).getCell(column).text??'').trim():''};const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];let imported=0,updated=0;const errors:{row:number;message:string}[]=[];const client=await db.connect()
  try{await client.query('BEGIN');for(let row=2;row<=sheet.rowCount;row++){const vehicleName=value(row,'Vehicle Name'),vehicleNumber=value(row,'Vehicle Number');if(!vehicleName&&!vehicleNumber)continue;if(!vehicleName||!vehicleNumber){errors.push({row,message:'Vehicle Name and Vehicle Number are required'});continue}const params=[vehicleName,value(row,'Vehicle Type'),vehicleNumber,value(row,'Driver Name'),value(row,'Driver Phone Number')];const existing=await client.query('SELECT id FROM ferry_vehicles WHERE company_id=$1 AND lower(vehicle_number)=lower($2) ORDER BY is_active DESC,updated_at DESC LIMIT 1',[company.company_id,vehicleNumber]);if(existing.rowCount){await client.query('UPDATE ferry_vehicles SET vehicle_name=$1,vehicle_type=$2,vehicle_number=$3,driver_name=$4,driver_phone_number=$5,is_active=true,updated_at=now() WHERE id=$6',[...params,existing.rows[0].id]);updated++}else{await client.query('INSERT INTO ferry_vehicles(company_id,vehicle_name,vehicle_type,vehicle_number,driver_name,driver_phone_number,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[company.company_id,...params,req.user!.id]);imported++}}await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}res.json({imported,updated,skipped:errors.length,errors:errors.slice(0,50)})
}))
app.post('/api/ferry-vehicles',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'Ferry Management'))return res.status(403).json({error:'Permission denied: Ferry Management'});const input=ferryVehicleInputSchema.parse(req.body);const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const duplicate=await db.query('SELECT 1 FROM ferry_vehicles WHERE company_id=$1 AND lower(vehicle_number)=lower($2) AND is_active=true',[company.company_id,input.vehicleNumber]);if(duplicate.rowCount)return res.status(409).json({error:'Ferry vehicle number already exists'})
  const result=await db.query('INSERT INTO ferry_vehicles(company_id,vehicle_name,vehicle_type,vehicle_number,driver_name,driver_phone_number,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[company.company_id,input.vehicleName,input.vehicleType,input.vehicleNumber,input.driverName,input.driverPhoneNumber,req.user!.id]);res.status(201).json(result.rows[0])
}))
app.put('/api/ferry-vehicles/:id',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'Ferry Management'))return res.status(403).json({error:'Permission denied: Ferry Management'});const input=ferryVehicleInputSchema.parse(req.body);const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const duplicate=await db.query('SELECT 1 FROM ferry_vehicles WHERE company_id=$1 AND lower(vehicle_number)=lower($2) AND id<>$3 AND is_active=true',[company.company_id,input.vehicleNumber,req.params.id]);if(duplicate.rowCount)return res.status(409).json({error:'Ferry vehicle number already exists'})
  const result=await db.query('UPDATE ferry_vehicles SET vehicle_name=$1,vehicle_type=$2,vehicle_number=$3,driver_name=$4,driver_phone_number=$5,updated_at=now() WHERE id=$6 AND company_id=$7 AND is_active=true RETURNING id',[input.vehicleName,input.vehicleType,input.vehicleNumber,input.driverName,input.driverPhoneNumber,req.params.id,company.company_id]);if(!result.rowCount)return res.status(404).json({error:'Ferry vehicle not found'});res.json(result.rows[0])
}))
app.delete('/api/ferry-vehicles/:id',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'Ferry Management'))return res.status(403).json({error:'Permission denied: Ferry Management'});const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const result=await db.query('UPDATE ferry_vehicles SET is_active=false,updated_at=now() WHERE id=$1 AND company_id=$2 AND is_active=true RETURNING id',[req.params.id,company.company_id]);if(!result.rowCount)return res.status(404).json({error:'Ferry vehicle not found'});res.json({message:'Ferry vehicle removed'})
}))
app.delete('/api/ferry-vehicles',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'Ferry Management'))return res.status(403).json({error:'Permission denied: Ferry Management'});const input=z.object({ids:z.array(z.string().uuid()).min(1).max(500)}).parse(req.body);const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const result=await db.query('UPDATE ferry_vehicles SET is_active=false,updated_at=now() WHERE company_id=$1 AND id=ANY($2::uuid[]) AND is_active=true RETURNING id',[company.company_id,input.ids]);res.json({removed:result.rowCount??0})
}))

const vehicleInputSchema=z.object({
  vehicleName:z.string().min(1).max(180),
  vehicleType:z.string().max(120).optional().default(''),
  vehiclePlateNumber:z.string().min(1).max(80),
  department:z.string().max(180).optional().default(''),
  driverName:z.string().max(180).optional().default(''),
  phoneNo:z.string().max(60).optional().default(''),
  status:z.enum(['Free','Busy']).optional().default('Free'),
  vehicleCategory:z.enum(['internal','maintenance']).optional().default('internal')
})
const vehicleCategoryFromRequest=(req:AuthRequest)=>String(req.query.category??req.body?.vehicleCategory??'internal')==='maintenance'?'maintenance':'internal'
const vehiclePermissionKey=(category:string)=>category==='maintenance'?'Vehicle Management (Maintenance)':'Vehicle Management (Internal)'
const looksLikeVehiclePlate=(value:string)=>/[\d]/.test(value)&&/^[A-Za-z0-9\s/\-.]+$/.test(value)&&value.length<=40
const vehicleColumns=(category:string)=>category==='maintenance'?[
  ['Vehicle Name','vehicle_name',24],
  ['Vehicle Type','vehicle_type',18],
  ['Vehicle Plate Number','vehicle_plate_number',22],
  ['Department','department',22],
] as [string,string,number][]:[
  ['Vehicle Name','vehicle_name',24],
  ['Vehicle Type','vehicle_type',18],
  ['Vehicle Plate Number','vehicle_plate_number',22],
  ['Driver Name','driver_name',24],
  ['Phone No','phone_no',18],
  ['Status','status',12],
] as [string,string,number][]
const vehicleWorkbook=async(category:string)=>{
  const workbook=new ExcelJS.Workbook();workbook.creator='Company Portal';const sheet=workbook.addWorksheet('Vehicles',{views:[{state:'frozen',ySplit:1}]})
  sheet.columns=vehicleColumns(category).map(([header,key,width])=>({header,key,width}))
  sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF6554DC'}};cell.alignment={vertical:'middle',wrapText:true}});sheet.autoFilter=`A1:${sheet.getColumn(sheet.columnCount).letter}1`
  sheet.addRow(category==='maintenance'
    ? {vehicle_name:'Example Vehicle',vehicle_type:'Truck',vehicle_plate_number:'YGN-1234',department:'Admin'}
    : {vehicle_name:'Example Vehicle',vehicle_type:'Truck',vehicle_plate_number:'YGN-1234',driver_name:'Driver Name',phone_no:'09xxxxxxxxx',status:'Free'})
  if(category==='internal')sheet.getColumn('status').eachCell((cell,row)=>{if(row>1)cell.dataValidation={type:'list',allowBlank:false,formulae:['"Free,Busy"']}})
  const instructions=workbook.addWorksheet('Instructions');instructions.columns=[{width:32},{width:90}];instructions.addRows([['Field','Instructions'],['Vehicle Name','Required'],['Vehicle Plate Number','Required and unique in this vehicle page'],['Department','Maintenance vehicles only'],['Driver Name / Phone No','Internal vehicles only'],['Status','Internal vehicles only: Free or Busy'],['Import notes','Do not rename the Vehicles sheet or headers. Existing plate numbers in the same page are updated; new plate numbers are inserted.']]);instructions.getRow(1).font={bold:true}
  return workbook
}

app.get('/api/vehicles/template',auth,asyncRoute(async(req,res)=>{
  const category=vehicleCategoryFromRequest(req);const menuKey=vehiclePermissionKey(category);if(!await hasMenuAccess(req,menuKey))return res.status(403).json({error:`Permission denied: ${menuKey}`})
  const buffer=await (await vehicleWorkbook(category)).xlsx.writeBuffer();res.setHeader('Content-Disposition',`attachment; filename="${category}-vehicle-import-template.xlsx"`);res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buffer))
}))

app.post('/api/vehicles/import',auth,upload.single('file'),asyncRoute(async(req,res)=>{
  const category=vehicleCategoryFromRequest(req);const menuKey=vehiclePermissionKey(category);if(!await hasMenuAccess(req,menuKey))return res.status(403).json({error:`Permission denied: ${menuKey}`});if(!req.file)return res.status(400).json({error:'An .xlsx file is required'})
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(req.file.buffer as unknown as ExcelJS.Buffer);const sheet=workbook.getWorksheet('Vehicles')??workbook.worksheets[0];if(!sheet)return res.status(400).json({error:'Vehicles worksheet not found'})
  const headers=new Map<string,number>();sheet.getRow(1).eachCell((cell,col)=>headers.set(String(cell.value).trim().toLowerCase(),col));const required=['Vehicle Name','Vehicle Plate Number'];const missing=required.filter(header=>!headers.has(header.toLowerCase()));if(missing.length)return res.status(400).json({error:`Missing columns: ${missing.join(', ')}`})
  const cellValue=(row:number,header:string)=>String(sheet.getRow(row).getCell(headers.get(header.toLowerCase())??0).text??'').trim()
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];let imported=0,updated=0;const errors:{row:number;message:string}[]=[]
  const client=await db.connect();try{await client.query('BEGIN');for(let row=2;row<=sheet.rowCount;row++){
    const vehicleName=cellValue(row,'Vehicle Name');let vehiclePlateNumber=cellValue(row,'Vehicle Plate Number');if(!vehicleName&&!vehiclePlateNumber)continue;if(!vehicleName||!vehiclePlateNumber){errors.push({row,message:'Vehicle Name and Vehicle Plate Number are required'});continue}
    const vehicleType=cellValue(row,'Vehicle Type');let department=category==='maintenance'?cellValue(row,'Department'):'';const driverName=category==='internal'?cellValue(row,'Driver Name'):'',phoneNo=category==='internal'?cellValue(row,'Phone No'):'';const rawStatus=headers.has('status')?cellValue(row,'Status'):'Free';const status=category==='internal'&&(rawStatus==='Busy'||rawStatus==='Free')?rawStatus:'Free'
    if(category==='maintenance'&&department&&looksLikeVehiclePlate(department)&&!looksLikeVehiclePlate(vehiclePlateNumber)){
      const swappedDepartment=vehiclePlateNumber;vehiclePlateNumber=department;department=swappedDepartment
      await client.query(`UPDATE vehicles SET is_active=false,updated_at=now() WHERE company_id=$1 AND vehicle_category='maintenance' AND lower(vehicle_plate_number)=lower($2) AND is_active=true`,[company.company_id,swappedDepartment])
    }
    const existing=await client.query('SELECT id FROM vehicles WHERE company_id=$1 AND vehicle_category=$2 AND lower(vehicle_plate_number)=lower($3) AND is_active=true',[company.company_id,category,vehiclePlateNumber])
    if(existing.rowCount){await client.query(`UPDATE vehicles SET vehicle_name=$1,vehicle_type=$2,vehicle_plate_number=$3,department=$4,driver_name=$5,phone_no=$6,status=$7,updated_at=now() WHERE id=$8`,[vehicleName,vehicleType,vehiclePlateNumber,department,driverName,phoneNo,status,existing.rows[0].id]);updated++}
    else{await client.query(`INSERT INTO vehicles(company_id,vehicle_category,vehicle_name,vehicle_type,vehicle_plate_number,department,driver_name,phone_no,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[company.company_id,category,vehicleName,vehicleType,vehiclePlateNumber,department,driverName,phoneNo,status,req.user!.id]);imported++}
  }await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  res.json({imported,updated,skipped:errors.length,errors:errors.slice(0,50)})
}))

app.get('/api/vehicles',auth,asyncRoute(async(req,res)=>{
  const category=vehicleCategoryFromRequest(req);const menuKey=vehiclePermissionKey(category);if(!await hasMenuAccess(req,menuKey))return res.status(403).json({error:`Permission denied: ${menuKey}`})
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const search=typeof req.query.q==='string'?req.query.q.trim():null
  const vehicleName=typeof req.query.vehicleName==='string'?req.query.vehicleName.trim():null
  const vehicleType=typeof req.query.vehicleType==='string'?req.query.vehicleType.trim():null
  const plateNumber=typeof req.query.plateNumber==='string'?req.query.plateNumber.trim():null
  const department=typeof req.query.department==='string'?req.query.department.trim():null
  const driverName=typeof req.query.driverName==='string'?req.query.driverName.trim():null
  const phoneNo=typeof req.query.phoneNo==='string'?req.query.phoneNo.trim():null
  const status=typeof req.query.status==='string'?req.query.status.trim():null
  const result=await db.query(
    `SELECT id,vehicle_category,vehicle_name,vehicle_type,vehicle_plate_number,department,driver_name,phone_no,status,is_active,created_at,updated_at
       FROM vehicles
      WHERE company_id=$1 AND vehicle_category=$10 AND is_active=true
        AND ($2::text IS NULL OR vehicle_name ILIKE '%'||$2||'%' OR vehicle_type ILIKE '%'||$2||'%' OR vehicle_plate_number ILIKE '%'||$2||'%' OR department ILIKE '%'||$2||'%' OR driver_name ILIKE '%'||$2||'%' OR phone_no ILIKE '%'||$2||'%')
        AND ($3::text IS NULL OR vehicle_name ILIKE '%'||$3||'%')
        AND ($4::text IS NULL OR vehicle_type ILIKE '%'||$4||'%')
        AND ($5::text IS NULL OR vehicle_plate_number ILIKE '%'||$5||'%')
        AND ($6::text IS NULL OR department ILIKE '%'||$6||'%')
        AND ($7::text IS NULL OR driver_name ILIKE '%'||$7||'%')
        AND ($8::text IS NULL OR phone_no ILIKE '%'||$8||'%')
        AND ($9::text IS NULL OR status=$9)
      ORDER BY created_at DESC`,
    [company.company_id,search||null,vehicleName||null,vehicleType||null,plateNumber||null,department||null,driverName||null,phoneNo||null,status||null,category]
  )
  res.json(result.rows)
}))

app.post('/api/vehicles',auth,asyncRoute(async(req,res)=>{
  const input=vehicleInputSchema.parse(req.body)
  const category=input.vehicleCategory;const menuKey=vehiclePermissionKey(category);if(!await hasMenuAccess(req,menuKey))return res.status(403).json({error:`Permission denied: ${menuKey}`})
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const duplicate=await db.query('SELECT 1 FROM vehicles WHERE company_id=$1 AND vehicle_category=$2 AND lower(vehicle_plate_number)=lower($3) AND is_active=true',[company.company_id,category,input.vehiclePlateNumber])
  if(duplicate.rowCount)return res.status(409).json({error:'Vehicle plate number already exists'})
  const result=await db.query(
    `INSERT INTO vehicles(company_id,vehicle_category,vehicle_name,vehicle_type,vehicle_plate_number,department,driver_name,phone_no,status,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id,vehicle_category,vehicle_name,vehicle_type,vehicle_plate_number,department,driver_name,phone_no,status,is_active,created_at,updated_at`,
    [company.company_id,category,input.vehicleName,input.vehicleType,input.vehiclePlateNumber,category==='maintenance'?input.department:'',category==='internal'?input.driverName:'',category==='internal'?input.phoneNo:'',category==='internal'?input.status:'Free',req.user!.id]
  )
  res.status(201).json(result.rows[0])
}))

app.put('/api/vehicles/:id',auth,asyncRoute(async(req,res)=>{
  const input=vehicleInputSchema.parse(req.body)
  const category=input.vehicleCategory;const menuKey=vehiclePermissionKey(category);if(!await hasMenuAccess(req,menuKey))return res.status(403).json({error:`Permission denied: ${menuKey}`})
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const duplicate=await db.query('SELECT 1 FROM vehicles WHERE company_id=$1 AND vehicle_category=$2 AND lower(vehicle_plate_number)=lower($3) AND id<>$4 AND is_active=true',[company.company_id,category,input.vehiclePlateNumber,req.params.id])
  if(duplicate.rowCount)return res.status(409).json({error:'Vehicle plate number already exists'})
  const result=await db.query(
    `UPDATE vehicles
        SET vehicle_name=$1,vehicle_type=$2,vehicle_plate_number=$3,department=$4,driver_name=$5,phone_no=$6,status=$7,updated_at=now()
      WHERE id=$8 AND company_id=$9 AND vehicle_category=$10 AND is_active=true
      RETURNING id,vehicle_category,vehicle_name,vehicle_type,vehicle_plate_number,department,driver_name,phone_no,status,is_active,created_at,updated_at`,
    [input.vehicleName,input.vehicleType,input.vehiclePlateNumber,category==='maintenance'?input.department:'',category==='internal'?input.driverName:'',category==='internal'?input.phoneNo:'',category==='internal'?input.status:'Free',req.params.id,company.company_id,category]
  )
  if(!result.rowCount)return res.status(404).json({error:'Vehicle not found'})
  res.json(result.rows[0])
}))

app.delete('/api/vehicles',auth,asyncRoute(async(req,res)=>{
  const input=z.object({ids:z.array(z.string().uuid()).min(1),vehicleCategory:z.enum(['internal','maintenance']).optional().default('internal')}).parse(req.body)
  const category=input.vehicleCategory;const menuKey=vehiclePermissionKey(category);if(!await hasMenuAccess(req,menuKey))return res.status(403).json({error:`Permission denied: ${menuKey}`})
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const result=await db.query(
    `UPDATE vehicles SET is_active=false,updated_at=now()
      WHERE company_id=$1 AND vehicle_category=$2 AND id=ANY($3::uuid[]) AND is_active=true
      RETURNING id`,
    [company.company_id,category,input.ids]
  )
  res.json({deleted:result.rowCount??0})
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

app.get('/api/approvals/all',auth,asyncRoute(async(req,res)=>{
  const privileged=['admin','hr'].includes(req.user!.role)
  const result=await db.query(`
    SELECT r.id,'hr'::text source,r.request_type,r.title,r.reason description,r.status,r.created_at,
      e.first_name,e.last_name,e.employee_no,d.name employee_department,NULL::text reference_no,NULL::numeric amount,NULL::text currency,
      CASE WHEN r.status='pending' THEN COALESCE(NULLIF(trim(ape.first_name||' '||ape.last_name),''),au.username,'Unassigned approver') ELSE NULL END pending_with
    FROM requests r JOIN employees e ON e.id=r.employee_id
    LEFT JOIN departments d ON d.id=e.department_id
    LEFT JOIN users au ON au.id=r.current_approver_id
    LEFT JOIN employees ape ON ape.id=au.employee_id
    WHERE e.company_id=(SELECT company_id FROM employees WHERE id=$3)
      AND ($1::boolean OR (r.status='pending' AND r.current_approver_id=$2))
    UNION ALL
    SELECT c.id,'corporate'::text source,c.request_type,c.purpose title,c.purpose description,c.status,c.created_at,
      e.first_name,e.last_name,e.employee_no,d.name employee_department,c.reference_no,c.amount,c.currency,
      CASE WHEN c.status='pending' THEN COALESCE(NULLIF(trim(pe.first_name||' '||pe.last_name),''),pu.username,'Unassigned approver') ELSE NULL END pending_with
    FROM corporate_requests c JOIN employees e ON e.id=c.employee_id
    LEFT JOIN departments d ON d.id=e.department_id
    LEFT JOIN approval_workflow_steps aws ON aws.company_id=e.company_id AND aws.request_type=c.request_type AND aws.step_order=c.current_step
    LEFT JOIN employees rte ON rte.id=e.manager_id LEFT JOIN users rtu ON rtu.employee_id=rte.id AND rtu.is_active=true
    LEFT JOIN users pu ON pu.id=(CASE WHEN aws.request_type IN ('payment','advance_clearance','vehicle_request') AND aws.step_order=1 THEN COALESCE(rtu.id,aws.approver_user_id) ELSE aws.approver_user_id END)
    LEFT JOIN employees pe ON pe.id=pu.employee_id
    WHERE e.company_id=(SELECT company_id FROM employees WHERE id=$3)
      AND ($1::boolean OR (c.status='pending' AND (CASE WHEN aws.request_type IN ('payment','advance_clearance','vehicle_request') AND aws.step_order=1 THEN COALESCE(rtu.id,aws.approver_user_id) ELSE aws.approver_user_id END)=$2))
    ORDER BY created_at DESC`,[privileged,req.user!.id,req.user!.employeeId])
  res.json(result.rows)
}))

app.get('/api/my-requests',auth,asyncRoute(async(req,res)=>{
  const result=await db.query(`
    SELECT r.id,r.id::text request_id,r.request_type,r.title,r.reason description,r.status,r.created_at,e.first_name,e.last_name,e.employee_no,d.name department,e.organization business_units,NULL::text payee,NULL::numeric amount,NULL::text currency,r.payload details,CASE WHEN r.status='pending' THEN COALESCE(NULLIF(trim(ae.first_name||' '||ae.last_name),''),au.username,'Unassigned approver') ELSE NULL END pending_with,'hr' source
    FROM requests r JOIN employees e ON e.id=r.employee_id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN users au ON au.id=r.current_approver_id LEFT JOIN employees ae ON ae.id=au.employee_id WHERE r.employee_id=$1
    UNION ALL
    SELECT c.id,c.reference_no request_id,c.request_type,c.purpose title,c.purpose description,c.status,c.created_at,e.first_name,e.last_name,e.employee_no,d.name department,e.organization business_units,c.payee,c.amount,c.currency,c.details,CASE WHEN c.status='pending' THEN COALESCE(NULLIF(trim(pe.first_name||' '||pe.last_name),''),pu.username,'Unassigned approver') ELSE NULL END pending_with,'corporate' source
    FROM corporate_requests c JOIN employees e ON e.id=c.employee_id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN approval_workflow_steps aws ON aws.company_id=e.company_id AND aws.request_type=c.request_type AND aws.step_order=c.current_step LEFT JOIN employees rte ON rte.id=e.manager_id LEFT JOIN users rtu ON rtu.employee_id=rte.id AND rtu.is_active=true LEFT JOIN users pu ON pu.id=(CASE WHEN aws.request_type IN ('payment','advance_clearance','vehicle_request') AND aws.step_order=1 THEN COALESCE(rtu.id,aws.approver_user_id) ELSE aws.approver_user_id END) LEFT JOIN employees pe ON pe.id=pu.employee_id WHERE c.employee_id=$1
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

app.get('/api/dashboard/announcements',auth,asyncRoute(async(req,res)=>{
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const result=await db.query(`SELECT a.id,a.title,a.body,a.published_at,COALESCE((SELECT json_agg(json_build_object('id',aa.id,'name',aa.original_name,'mimeType',aa.mime_type,'size',aa.file_size) ORDER BY aa.created_at) FROM announcement_attachments aa WHERE aa.announcement_id=a.id),'[]') attachments FROM announcements a WHERE a.company_id=$1 AND a.published_at IS NOT NULL ORDER BY a.published_at DESC LIMIT 4`,[company.company_id])
  res.json(result.rows)
}))

app.get('/api/dashboard/announcements/:id/attachments/:attachmentId',auth,asyncRoute(async(req,res)=>{
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const file=(await db.query(`SELECT aa.* FROM announcement_attachments aa JOIN announcements a ON a.id=aa.announcement_id WHERE aa.id=$1 AND aa.announcement_id=$2 AND a.company_id=$3 AND a.published_at IS NOT NULL`,[req.params.attachmentId,req.params.id,company.company_id])).rows[0]
  if(!file)return res.status(404).json({error:'Attachment not found'})
  res.type(file.mime_type);res.setHeader('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);res.sendFile(join(uploadDirectory,file.stored_name))
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

app.get('/api/reports/payment-requests', auth, asyncRoute(async (req,res) => {
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  if(!company)return res.status(404).json({error:'Employee company was not found'})
  const result=await db.query(`SELECT c.id,c.reference_no,c.created_at submission_date,e.employee_no,trim(e.first_name||' '||e.last_name) requestor_name,d.name department,
    COALESCE(c.details->>'businessUnit',e.project_location,'') business_unit,COALESCE(c.details->>'paymentType','') payment_type,
    COALESCE(c.details->>'paymentMethod','') payment_method,c.payee pay_to,c.currency,c.amount,c.purpose description,c.status,c.current_step,c.approved_at,c.updated_at,
    COALESCE(NULLIF(trim(pe.first_name||' '||pe.last_name),''),pu.username) pending_with
    FROM corporate_requests c JOIN employees e ON e.id=c.employee_id LEFT JOIN departments d ON d.id=e.department_id
    LEFT JOIN approval_workflow_steps aws ON aws.company_id=e.company_id AND aws.request_type=c.request_type AND aws.step_order=c.current_step AND c.status='pending'
    LEFT JOIN employees rte ON rte.id=e.manager_id LEFT JOIN users rtu ON rtu.employee_id=rte.id AND rtu.is_active=true
    LEFT JOIN users pu ON pu.id=(CASE WHEN aws.request_type IN ('payment','advance_clearance','vehicle_request') AND aws.step_order=1 THEN COALESCE(rtu.id,aws.approver_user_id) ELSE aws.approver_user_id END) LEFT JOIN employees pe ON pe.id=pu.employee_id
    WHERE e.company_id=$1 AND c.request_type='payment' ORDER BY c.created_at DESC`,[company.company_id])
  res.json(result.rows)
}))

app.get('/api/reports/export', auth, asyncRoute(async (req,res) => {
  const type=typeof req.query.type==='string'?req.query.type:'attendance'
  const queries:Record<string,string>={
    attendance:`SELECT a.work_date,e.employee_no,trim(e.first_name||' '||e.last_name) employee_name,d.name department,a.check_in,a.check_out,a.status,a.source FROM attendance a JOIN employees e ON e.id=a.employee_id LEFT JOIN departments d ON d.id=e.department_id ORDER BY a.work_date DESC,e.employee_no`,
    leave:`SELECT e.employee_no,trim(e.first_name||' '||e.last_name) employee_name,d.name department,r.title,r.reason,r.start_at,r.end_at,r.status,r.created_at submitted_at FROM requests r JOIN employees e ON e.id=r.employee_id LEFT JOIN departments d ON d.id=e.department_id WHERE r.request_type='leave' ORDER BY r.created_at DESC`,
    overtime:`SELECT e.employee_no,trim(e.first_name||' '||e.last_name) employee_name,d.name department,r.title,r.reason,r.start_at,r.end_at,r.status,r.created_at submitted_at FROM requests r JOIN employees e ON e.id=r.employee_id LEFT JOIN departments d ON d.id=e.department_id WHERE r.request_type='overtime' ORDER BY r.created_at DESC`,
    approvals:`SELECT e.employee_no,trim(e.first_name||' '||e.last_name) employee_name,r.request_type,r.title,r.status,r.created_at submitted_at,r.updated_at last_updated FROM requests r JOIN employees e ON e.id=r.employee_id ORDER BY r.created_at DESC`,
    payment_requests:`SELECT c.reference_no request_id,c.created_at submission_date,e.employee_no,trim(e.first_name||' '||e.last_name) requestor_name,d.name department,COALESCE(c.details->>'businessUnit',e.project_location,'') business_unit,COALESCE(c.details->>'paymentType','') payment_type,COALESCE(c.details->>'paymentMethod','') payment_method,c.payee pay_to,c.currency,c.amount,c.purpose description,c.status,c.approved_at,c.updated_at FROM corporate_requests c JOIN employees e ON e.id=c.employee_id LEFT JOIN departments d ON d.id=e.department_id WHERE c.request_type='payment' AND e.company_id=(SELECT company_id FROM employees WHERE id='${req.user!.employeeId}') ORDER BY c.created_at DESC`
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
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'Admin or HR access required'});const requestType=z.enum(['payment','advance_clearance','vehicle_request']).parse(req.params.requestType);const input=z.object({steps:z.array(z.object({stepOrder:z.number().int().min(1).max(20),stepName:z.string().min(2).max(120),approverUserId:z.uuid().nullable().optional()})).min(1).max(20)}).parse(req.body);const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const client=await db.connect();try{await client.query('BEGIN');for(const step of input.steps)await client.query(`INSERT INTO approval_workflow_steps(company_id,request_type,step_order,step_name,approver_user_id,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(company_id,request_type,step_order) DO UPDATE SET step_name=$4,approver_user_id=$5,updated_by=$6,updated_at=now()`,[company.company_id,requestType,step.stepOrder,step.stepName,step.approverUserId??null,req.user!.id]);await client.query('COMMIT');res.json({message:'Approval workflow saved successfully'})}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
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
  const [result,workflowApprover]=await Promise.all([
    db.query(`SELECT rp.menu_key FROM role_permissions rp JOIN employees e ON e.company_id=rp.company_id WHERE e.id=$1 AND rp.role=$2 AND rp.allowed=true ORDER BY rp.menu_key`,[req.user!.employeeId,req.user!.role]),
    db.query(`SELECT 1 FROM approval_workflow_steps WHERE approver_user_id=$1 UNION SELECT 1 FROM corporate_requests c JOIN employees e ON e.id=c.employee_id JOIN approval_workflow_steps aws ON aws.company_id=e.company_id AND aws.request_type=c.request_type AND aws.step_order=c.current_step LEFT JOIN employees rte ON rte.id=e.manager_id LEFT JOIN users rtu ON rtu.employee_id=rte.id AND rtu.is_active=true WHERE c.status='pending' AND (CASE WHEN aws.request_type IN ('payment','advance_clearance','vehicle_request') AND aws.step_order=1 THEN COALESCE(rtu.id,aws.approver_user_id) ELSE aws.approver_user_id END)=$1 LIMIT 1`,[req.user!.id]),
  ]);
  res.json({role:req.user!.role,menus:req.user!.role==='admin'?['*']:result.rows.map(row=>row.menu_key),isWorkflowApprover:(workflowApprover.rowCount??0)>0})
}))

app.get('/api/permissions',auth,permit('Permission'),asyncRoute(async(req,res)=>{
  const result=await db.query(`SELECT rp.role,rp.menu_key,rp.allowed FROM role_permissions rp JOIN employees e ON e.company_id=rp.company_id WHERE e.id=$1 ORDER BY rp.role,rp.menu_key`,[req.user!.employeeId]);res.json(result.rows)
}))

app.put('/api/permissions',auth,permit('Permission'),asyncRoute(async(req,res)=>{
  const input=z.object({role:z.string().min(2).max(30).regex(/^[a-z][a-z0-9_]*$/),menuKey:z.string().min(2).max(80),allowed:z.boolean()}).parse(req.body);const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const roleExists=await db.query('SELECT 1 FROM user_roles WHERE company_id=$1 AND role_key=$2',[company.company_id,input.role]);if(!roleExists.rowCount)return res.status(400).json({error:'Unknown role'});const result=await db.query(`INSERT INTO role_permissions(company_id,role,menu_key,allowed,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(company_id,role,menu_key) DO UPDATE SET allowed=$4,updated_by=$5,updated_at=now() RETURNING *`,[company.company_id,input.role,input.menuKey,input.allowed,req.user!.id]);res.json(result.rows[0])
}))

app.get('/api/corporate-requests',auth,asyncRoute(async(req,res)=>{
  const type=typeof req.query.type==='string'?req.query.type:null;const privileged=['admin','hr'].includes(req.user!.role);const result=await db.query(`SELECT c.*,e.employee_no,trim(e.first_name||' '||e.last_name) employee_name,d.name employee_department,e.organization business_units,CASE WHEN c.status='pending' THEN COALESCE(NULLIF(trim(pe.first_name||' '||pe.last_name),''),pu.username,'Unassigned approver') ELSE NULL END pending_with FROM corporate_requests c JOIN employees e ON e.id=c.employee_id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN approval_workflow_steps aws ON aws.company_id=e.company_id AND aws.request_type=c.request_type AND aws.step_order=c.current_step LEFT JOIN employees rte ON rte.id=e.manager_id LEFT JOIN users rtu ON rtu.employee_id=rte.id AND rtu.is_active=true LEFT JOIN users pu ON pu.id=(CASE WHEN aws.request_type IN ('payment','advance_clearance','vehicle_request') AND aws.step_order=1 THEN COALESCE(rtu.id,aws.approver_user_id) ELSE aws.approver_user_id END) LEFT JOIN employees pe ON pe.id=pu.employee_id WHERE ($1::text IS NULL OR c.request_type=$1) AND e.company_id=(SELECT company_id FROM employees WHERE id=$2) AND ($4::boolean OR c.employee_id=$2 OR (CASE WHEN aws.request_type IN ('payment','advance_clearance','vehicle_request') AND aws.step_order=1 THEN COALESCE(rtu.id,aws.approver_user_id) ELSE aws.approver_user_id END)=$3) ORDER BY c.created_at DESC`,[type,req.user!.employeeId,req.user!.id,privileged]);res.json(result.rows)
}))

app.get('/api/corporate-requests/:id',auth,asyncRoute(async(req,res)=>{
  const request=(await db.query(`SELECT c.*,e.company_id,e.employee_no,trim(e.first_name||' '||e.last_name) employee_name,d.name employee_department,e.organization business_units,e.project_location FROM corporate_requests c JOIN employees e ON e.id=c.employee_id LEFT JOIN departments d ON d.id=e.department_id WHERE c.id=$1`,[req.params.id])).rows[0]
  if(!request)return res.status(404).json({error:'Request not found'})
  const viewer=(await db.query(`SELECT company_id FROM employees WHERE id=$1`,[req.user!.employeeId])).rows[0]
  if(!viewer||viewer.company_id!==request.company_id)return res.status(403).json({error:'Request access denied'})
  const steps=await getCorporateApprovalSteps(db,request)
  const isOwner=request.employee_id===req.user!.employeeId
  const isWorkflowApprover=steps.some(step=>step.approver_user_id===req.user!.id)
  const isPrivileged=['admin','hr'].includes(req.user!.role)
  if(!isOwner&&!isWorkflowApprover&&!isPrivileged)return res.status(403).json({error:'You can only view your own or assigned requests'})
  const attachments=(await db.query(`SELECT id,original_name,mime_type,file_size FROM corporate_request_attachments WHERE corporate_request_id=$1 ORDER BY created_at`,[request.id])).rows
  const current=steps.find(step=>Number(step.step_order)===Number(request.current_step))
  const canAct=request.status==='pending'&&current?.approver_user_id===req.user!.id
  res.json({request,steps,attachments,canAct,canAssignVehicle:canAct&&request.request_type==='vehicle_request'&&isTransportationStep(current)})
}))

app.get('/api/corporate-requests/:id/available-vehicles',auth,asyncRoute(async(req,res)=>{
  const request=(await db.query(`SELECT c.*,e.company_id FROM corporate_requests c JOIN employees e ON e.id=c.employee_id WHERE c.id=$1`,[req.params.id])).rows[0]
  if(!request)return res.status(404).json({error:'Request not found'})
  const steps=await getCorporateApprovalSteps(db,request)
  const current=steps.find(step=>Number(step.step_order)===Number(request.current_step))
  if(request.status!=='pending'||current?.approver_user_id!==req.user!.id||request.request_type!=='vehicle_request'||!isTransportationStep(current))return res.status(403).json({error:'Vehicle assignment is only available to the current Transportation Supervisor'})
  const assigned=assignedVehicleFrom(detailsRecord(request.details))
  const result=await db.query(`SELECT id,vehicle_name,vehicle_type,vehicle_plate_number,driver_name,phone_no,status FROM vehicles WHERE company_id=$1 AND vehicle_category='internal' AND is_active=true AND (lower(status)='free' OR id::text=$2) ORDER BY CASE WHEN id::text=$2 THEN 0 ELSE 1 END,vehicle_name,vehicle_plate_number`,[request.company_id,String(assigned.id??'')])
  res.json(result.rows)
}))

app.post('/api/corporate-requests/:id/assign-vehicle',auth,asyncRoute(async(req,res)=>{
  const input=z.object({vehicleId:z.string().uuid()}).parse(req.body)
  const client=await db.connect()
  try{
    await client.query('BEGIN')
    const request=(await client.query(`SELECT c.*,e.company_id FROM corporate_requests c JOIN employees e ON e.id=c.employee_id WHERE c.id=$1 FOR UPDATE`,[req.params.id])).rows[0]
    if(!request||request.status!=='pending'){await client.query('ROLLBACK');return res.status(409).json({error:'Request is no longer pending'})}
    const steps=await getCorporateApprovalSteps(client,request)
    const current=steps.find(step=>Number(step.step_order)===Number(request.current_step))
    if(current?.approver_user_id!==req.user!.id||request.request_type!=='vehicle_request'||!isTransportationStep(current)){await client.query('ROLLBACK');return res.status(403).json({error:'Vehicle assignment is only available to the current Transportation Supervisor'})}
    const details=detailsRecord(request.details)
    const previous=assignedVehicleFrom(details)
    const vehicle=(await client.query(`SELECT id,vehicle_name,vehicle_type,vehicle_plate_number,driver_name,phone_no,status FROM vehicles WHERE id=$1 AND company_id=$2 AND vehicle_category='internal' AND is_active=true FOR UPDATE`,[input.vehicleId,request.company_id])).rows[0]
    if(!vehicle){await client.query('ROLLBACK');return res.status(404).json({error:'Vehicle not found'})}
    if(String(vehicle.status).toLowerCase()!=='free'&&String(vehicle.id)!==String(previous.id??'')){await client.query('ROLLBACK');return res.status(409).json({error:'This vehicle is no longer free'})}
    if(previous.id&&String(previous.id)!==String(vehicle.id))await client.query(`UPDATE vehicles SET status='Free',updated_at=now() WHERE id=$1 AND company_id=$2`,[previous.id,request.company_id])
    await client.query(`UPDATE vehicles SET status='Busy',updated_at=now() WHERE id=$1`,[vehicle.id])
    const assignedVehicle={id:vehicle.id,vehicleName:vehicle.vehicle_name,vehicleType:vehicle.vehicle_type,vehiclePlateNumber:vehicle.vehicle_plate_number,driverName:vehicle.driver_name,phoneNo:vehicle.phone_no}
    await client.query(`UPDATE corporate_requests SET details=$1::jsonb,updated_at=now() WHERE id=$2`,[JSON.stringify({...details,assignedVehicle}),request.id])
    const owner=(await client.query(`SELECT id FROM users WHERE employee_id=$1 AND is_active=true`,[request.employee_id])).rows[0]
    if(owner)await client.query(`INSERT INTO notifications(user_id,title,message,notification_type,resource_type,resource_id) VALUES($1,$2,$3,'vehicle_assignment','corporate_request',$4)`,[owner.id,`Vehicle Assigned (${request.reference_no})`,`Vehicle Plate Number: ${vehicle.vehicle_plate_number||'-'}. Vehicle Name: ${vehicle.vehicle_name||'-'}. Driver Name: ${vehicle.driver_name||'-'}. Phone No: ${vehicle.phone_no||'-'}.`,request.id])
    await client.query('COMMIT')
    res.json({assignedVehicle})
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}))

app.post('/api/corporate-requests/:id/action',auth,asyncRoute(async(req,res)=>{
  const input=z.object({action:z.enum(['approved','rejected']),comment:z.string().max(1000).optional()}).parse(req.body)
  const client=await db.connect()
  try{
    await client.query('BEGIN')
    const request=(await client.query(`SELECT c.*,e.company_id FROM corporate_requests c JOIN employees e ON e.id=c.employee_id WHERE c.id=$1 FOR UPDATE`,[req.params.id])).rows[0]
    if(!request||request.status!=='pending'){await client.query('ROLLBACK');return res.status(409).json({error:'Request is no longer pending'})}
    const steps=await getCorporateApprovalSteps(client,request)
    const current=steps.find(step=>Number(step.step_order)===Number(request.current_step))
    if(!current||current.approver_user_id!==req.user!.id){await client.query('ROLLBACK');return res.status(403).json({error:'This request is not assigned to you at the current approval step'})}
    const requestDetails=detailsRecord(request.details)
    const assignedVehicle=assignedVehicleFrom(requestDetails)
    if(input.action==='approved'&&request.request_type==='vehicle_request'&&isTransportationStep(current)&&!assignedVehicle.id){await client.query('ROLLBACK');return res.status(400).json({error:'Assign a free vehicle before approving this request'})}
    await client.query(`INSERT INTO corporate_approval_actions(corporate_request_id,step_order,approver_user_id,action,comment) VALUES($1,$2,$3,$4,$5) ON CONFLICT(corporate_request_id,step_order) DO UPDATE SET approver_user_id=$3,action=$4,comment=$5,acted_at=now()`,[request.id,request.current_step,req.user!.id,input.action,input.comment??null])
    const lastStep=Math.max(...steps.map(step=>Number(step.step_order)))
    const nextStatus=input.action==='rejected'?'rejected':Number(request.current_step)>=lastStep?'approved':'pending'
    const nextStep=input.action==='approved'&&Number(request.current_step)<lastStep?Number(request.current_step)+1:Number(request.current_step)
    await client.query(`UPDATE corporate_requests SET status=$1,current_step=$2,approved_at=CASE WHEN $1='approved' THEN now() ELSE approved_at END,updated_at=now() WHERE id=$3`,[nextStatus,nextStep,request.id])
    if(input.action==='rejected'&&request.request_type==='vehicle_request'&&assignedVehicle.id)await client.query(`UPDATE vehicles SET status='Free',updated_at=now() WHERE id=$1 AND company_id=$2`,[assignedVehicle.id,request.company_id])
    const owner=(await client.query(`SELECT u.id FROM users u WHERE u.employee_id=$1`,[request.employee_id])).rows[0]
    const approver=(await client.query(`SELECT COALESCE(NULLIF(trim(e.first_name||' '||e.last_name),''),u.username) AS approver_name FROM users u LEFT JOIN employees e ON e.id=u.employee_id WHERE u.id=$1`,[req.user!.id])).rows[0]
    const next=nextStatus==='pending'?steps.find(step=>Number(step.step_order)===nextStep):null
    const nextApprover=next?.approver_user_id?(await client.query(`SELECT COALESCE(NULLIF(trim(e.first_name||' '||e.last_name),''),u.username) AS approver_name FROM users u LEFT JOIN employees e ON e.id=u.employee_id WHERE u.id=$1`,[next.approver_user_id])).rows[0]:null
    const requestLabel=request.request_type==='vehicle_request'?'vehicle request':request.request_type==='advance_clearance'?'advance clearance request':'payment request'
    const formTitle=request.request_type==='vehicle_request'?'Vehicle Request Form':request.request_type==='advance_clearance'?'Advance Clearance Request Form':'Payment Request Form'
    const title=`${formTitle} (${request.reference_no})`
    const assignmentSummary=request.request_type==='vehicle_request'&&assignedVehicle.id?` Vehicle Plate Number: ${assignedVehicle.vehiclePlateNumber??'-'}. Vehicle Name: ${assignedVehicle.vehicleName??'-'}. Driver Name: ${assignedVehicle.driverName??'-'}. Phone No: ${assignedVehicle.phoneNo??'-'}.`:''
    const message=input.action==='rejected'?`Your ${requestLabel} ${request.reference_no} was rejected by ${approver?.approver_name??'the approver'}.`:nextStatus==='pending'?`Your ${requestLabel} ${request.reference_no} was approved by ${approver?.approver_name??'the approver'}. Your ${requestLabel} is continued to ${nextApprover?.approver_name??'the next approver'}.`:`Your ${requestLabel} ${request.reference_no} was approved by ${approver?.approver_name??'the approver'}. Your ${requestLabel} is fully approved.${assignmentSummary}`
    if(owner)await client.query(`INSERT INTO notifications(user_id,title,message,notification_type,resource_type,resource_id) VALUES($1,$2,$3,'request_status','corporate_request',$4)`,[owner.id,title,message,request.id])
    if(next?.approver_user_id)await client.query(`INSERT INTO notifications(user_id,title,message,notification_type,resource_type,resource_id) VALUES($1,$2,$3,'approval','corporate_request',$4)`,[next.approver_user_id,`${formTitle} approval required`,`${request.reference_no} is waiting for your approval.`,request.id])
    await client.query('COMMIT')
    res.json({status:nextStatus,currentStep:nextStep})
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}))

app.post('/api/corporate-requests/:id/action-legacy',auth,asyncRoute(async(req,res)=>{
  const input=z.object({action:z.enum(['approved','rejected']),comment:z.string().max(1000).optional()}).parse(req.body);const client=await db.connect();try{await client.query('BEGIN');const request=(await client.query(`SELECT c.*,e.company_id FROM corporate_requests c JOIN employees e ON e.id=c.employee_id WHERE c.id=$1 FOR UPDATE`,[req.params.id])).rows[0];if(!request||request.status!=='pending'){await client.query('ROLLBACK');return res.status(409).json({error:'Request is no longer pending'})}const steps=(await client.query(`SELECT * FROM approval_workflow_steps WHERE company_id=$1 AND request_type=$2 ORDER BY step_order`,[request.company_id,request.request_type])).rows;const current=steps.find(step=>Number(step.step_order)===Number(request.current_step));if(!current||current.approver_user_id!==req.user!.id){await client.query('ROLLBACK');return res.status(403).json({error:'This request is not assigned to you at the current approval step'})}await client.query(`INSERT INTO corporate_approval_actions(corporate_request_id,step_order,approver_user_id,action,comment) VALUES($1,$2,$3,$4,$5)`,[request.id,request.current_step,req.user!.id,input.action,input.comment??null]);const lastStep=Math.max(...steps.map(step=>Number(step.step_order)));const nextStatus=input.action==='rejected'?'rejected':Number(request.current_step)>=lastStep?'approved':'pending';const nextStep=input.action==='approved'&&Number(request.current_step)<lastStep?Number(request.current_step)+1:Number(request.current_step);await client.query(`UPDATE corporate_requests SET status=$1,current_step=$2,approved_at=CASE WHEN $1='approved' THEN now() ELSE approved_at END,updated_at=now() WHERE id=$3`,[nextStatus,nextStep,request.id]);const owner=(await client.query(`SELECT u.id FROM users u WHERE u.employee_id=$1`,[request.employee_id])).rows[0];const approver=(await client.query(`SELECT COALESCE(NULLIF(trim(e.first_name||' '||e.last_name),''),u.username) name FROM users u LEFT JOIN employees e ON e.id=u.employee_id WHERE u.id=$1`,[req.user!.id])).rows[0];const next=nextStatus==='pending'?steps.find(step=>Number(step.step_order)===nextStep):null;const nextApprover=next?.approver_user_id?(await client.query(`SELECT COALESCE(NULLIF(trim(e.first_name||' '||e.last_name),''),u.username) name FROM users u LEFT JOIN employees e ON e.id=u.employee_id WHERE u.id=$1`,[next.approver_user_id])).rows[0]:null;const title=`Payment Request Form (${request.reference_no})`;const message=input.action==='rejected'?`Your payment request ${request.reference_no} was rejected by ${approver?.name??'the approver'}.`:nextStatus==='pending'?`Your payment request ${request.reference_no} was approved by ${approver?.name??'the approver'}. Your payment request is continued to ${nextApprover?.name??'the next approver'}.`:`Your payment request ${request.reference_no} was approved by ${approver?.name??'the approver'}. Your payment request is fully approved.`;if(owner)await client.query(`INSERT INTO notifications(user_id,title,message,notification_type,resource_type,resource_id) VALUES($1,$2,$3,'request_status','corporate_request',$4)`,[owner.id,title,message,request.id]);if(next?.approver_user_id)await client.query(`INSERT INTO notifications(user_id,title,message,notification_type,resource_type,resource_id) VALUES($1,'Payment approval required',$2,'approval','corporate_request',$3)`,[next.approver_user_id,`${request.reference_no} is waiting for your approval.`,request.id]);await client.query('COMMIT');res.json({status:nextStatus,currentStep:nextStep})}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}))

app.get('/api/corporate-requests/:id/attachments/:attachmentId',auth,asyncRoute(async(req,res)=>{
  const access=(await db.query(`SELECT c.id,e.company_id,c.employee_id,c.request_type FROM corporate_requests c JOIN employees e ON e.id=c.employee_id WHERE c.id=$1`,[req.params.id])).rows[0];if(!access)return res.status(404).json({error:'Request not found'});const viewer=(await db.query(`SELECT company_id FROM employees WHERE id=$1`,[req.user!.employeeId])).rows[0];const steps=await getCorporateApprovalSteps(db,access);const allowed=viewer?.company_id===access.company_id&&(access.employee_id===req.user!.employeeId||steps.some(step=>step.approver_user_id===req.user!.id)||['admin','hr'].includes(req.user!.role));if(!allowed)return res.status(403).json({error:'Attachment access denied'});const file=(await db.query(`SELECT * FROM corporate_request_attachments WHERE id=$1 AND corporate_request_id=$2`,[req.params.attachmentId,req.params.id])).rows[0];if(!file)return res.status(404).json({error:'Attachment not found'});res.type(file.mime_type);res.setHeader('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);res.sendFile(join(uploadDirectory,file.stored_name))
}))

app.post('/api/corporate-requests',auth,permitCorporateRequest,attachmentUpload.array('attachments',5),asyncRoute(async(req,res)=>{
  const rawDetails=typeof req.body.details==='string'?JSON.parse(req.body.details):req.body.details;const input=z.object({requestType:z.enum(['payment','advance_clearance','vehicle_request']),payee:z.string().max(180).optional().default(''),purpose:z.string().min(3).max(3000),amount:z.coerce.number().nonnegative(),currency:z.enum(['USD','EURO','CNY','MMK','THB']).default('MMK'),details:z.record(z.string(),z.unknown()).optional()}).parse({...req.body,details:rawDetails});const requester=(await db.query(`SELECT e.company_id,COALESCE(NULLIF(trim(m.first_name||' '||m.last_name),''),m.employee_no) manager_name,mu.id report_to_user_id FROM employees e LEFT JOIN employees m ON m.id=e.manager_id LEFT JOIN users mu ON mu.employee_id=m.id AND mu.is_active=true WHERE e.id=$1`,[req.user!.employeeId])).rows[0];if(!requester)return res.status(404).json({error:'Employee profile was not found'});const configuredApprover=(await db.query(`SELECT approver_user_id id FROM approval_workflow_steps WHERE company_id=$1 AND request_type=$2 AND step_order=1`,[requester.company_id,input.requestType])).rows[0];const fallbackApprover=(await db.query(`SELECT id FROM users WHERE role IN ('manager','approver','hr','admin') AND is_active=true ORDER BY CASE role WHEN 'manager' THEN 1 WHEN 'approver' THEN 2 WHEN 'hr' THEN 3 ELSE 4 END LIMIT 1`)).rows[0];const usesDynamicDepartmentHead=['payment','advance_clearance','vehicle_request'].includes(input.requestType);const approver=usesDynamicDepartmentHead?{id:requester.report_to_user_id}:configuredApprover?.id?configuredApprover:fallbackApprover;if(usesDynamicDepartmentHead&&!approver.id)return res.status(400).json({error:`Report To approver is required before submitting this request${requester.manager_name?`: ${requester.manager_name} does not have an active user account`:'. Please update the employee Report To first.'}`});const prefix=input.requestType==='vehicle_request'?'VRF':input.requestType==='advance_clearance'?'ACR':'PRF';const approvalTitle=input.requestType==='vehicle_request'?'Vehicle request approval required':input.requestType==='advance_clearance'?'Advance clearance approval required':'Payment approval required';const reference=`${prefix}-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`;const client=await db.connect();try{await client.query('BEGIN');const result=await client.query(`INSERT INTO corporate_requests(employee_id,request_type,reference_no,payee,purpose,amount,currency,details,approver_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[req.user!.employeeId,input.requestType,reference,input.payee,input.purpose,input.amount,input.currency,input.details??{},approver?.id??null]);for(const file of ((req.files as Express.Multer.File[] | undefined)??[]))await client.query(`INSERT INTO corporate_request_attachments(corporate_request_id,original_name,stored_name,mime_type,file_size) VALUES($1,$2,$3,$4,$5)`,[result.rows[0].id,file.originalname,file.filename,file.mimetype,file.size]);if(approver?.id)await client.query(`INSERT INTO notifications(user_id,title,message,notification_type,resource_type,resource_id) VALUES($1,$2,$3,'approval','corporate_request',$4)`,[approver.id,approvalTitle,`${result.rows[0].reference_no} is waiting for your approval.`,result.rows[0].id]);await client.query('COMMIT');res.status(201).json(result.rows[0])}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}))

app.post('/api/announcements/:id/attachments',auth,permit('Announcements'),attachmentUpload.array('files',5),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const files=(req.files as Express.Multer.File[])??[];const inserted=[];for(const file of files){const result=await db.query(`INSERT INTO announcement_attachments(announcement_id,original_name,stored_name,mime_type,file_size) VALUES($1,$2,$3,$4,$5) RETURNING *`,[req.params.id,file.originalname,file.filename,file.mimetype,file.size]);inserted.push(result.rows[0])}res.status(201).json(inserted)
}))

app.get('/api/announcements/:id/attachments/:attachmentId',auth,permit('Announcements'),asyncRoute(async(req,res)=>{
  const result=await db.query(`SELECT * FROM announcement_attachments WHERE id=$1 AND announcement_id=$2`,[req.params.attachmentId,req.params.id]);if(!result.rowCount)return res.status(404).json({error:'Attachment not found'});const file=result.rows[0];res.download(join(uploadDirectory,file.stored_name),file.original_name)
}))

app.use((error: unknown,req: Request,res: Response,_next: NextFunction) => {
  if(error instanceof z.ZodError)return res.status(400).json({error:'Invalid request',details:error.issues})
  console.error(`[API ERROR] ${req.method} ${req.originalUrl}`,error); res.status(500).json({error:'Internal server error'})
})

const port=Number(process.env.PORT ?? 4000)
app.listen(port,()=>console.log(`Company Portal API running at http://localhost:${port}`))
