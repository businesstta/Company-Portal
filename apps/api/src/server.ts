import 'dotenv/config'
import bcrypt from 'bcryptjs'
import cors from 'cors'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdirSync, unlinkSync } from 'node:fs'
import { extname, join } from 'node:path'
import { promisify } from 'node:util'
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
const clearanceAttachmentUpload=multer({storage:multer.diskStorage({destination:uploadDirectory,filename:(_req,file,cb)=>cb(null,`${randomUUID()}${extname(file.originalname).toLowerCase()}`)}),limits:{fileSize:500*1024*1024,files:20},fileFilter:(_req,file,cb)=>cb(null,/^(image\/|audio\/|video\/|text\/|application\/(pdf|zip|x-7z-compressed|x-rar-compressed|msword|vnd\.openxmlformats-officedocument|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.oasis\.opendocument))/.test(file.mimetype))})
const corporateRequestUpload=(req:Request,res:Response,next:NextFunction)=>{const largeUpload=['payment','advance_clearance'].includes(String(req.query.type));return(largeUpload?clearanceAttachmentUpload:attachmentUpload).array('attachments',largeUpload?20:5)(req,res,next)}
const employeeDocumentExtensions=new Set(['.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.txt','.csv','.rtf','.odt','.ods','.odp','.jpg','.jpeg','.png','.webp','.gif','.bmp','.tif','.tiff','.heic','.eml','.msg','.zip','.rar','.7z'])
const employeeDocumentUpload=multer({storage:multer.diskStorage({destination:uploadDirectory,filename:(_req,file,cb)=>cb(null,`${randomUUID()}${extname(file.originalname).toLowerCase()}`)}),limits:{fileSize:20*1024*1024,files:10},fileFilter:(_req,file,cb)=>cb(null,employeeDocumentExtensions.has(extname(file.originalname).toLowerCase()))})
const learningContentExtensions=new Set(['.pdf','.doc','.docx','.ppt','.pptx','.xls','.xlsx','.txt','.csv','.jpg','.jpeg','.png','.webp','.gif','.mp4','.webm','.mov','.m4v','.mp3','.wav','.zip'])
const learningContentUpload=multer({storage:multer.diskStorage({destination:uploadDirectory,filename:(_req,file,cb)=>cb(null,`${randomUUID()}${extname(file.originalname).toLowerCase()}`)}),limits:{fileSize:100*1024*1024,files:1},fileFilter:(_req,file,cb)=>cb(null,learningContentExtensions.has(extname(file.originalname).toLowerCase()))})
const assetImageUpload=multer({storage:multer.diskStorage({destination:uploadDirectory,filename:(_req,file,cb)=>cb(null,`${randomUUID()}${extname(file.originalname).toLowerCase()}`)}),limits:{fileSize:5*1024*1024,files:1},fileFilter:(_req,file,cb)=>cb(null,/^image\/(jpeg|png|webp)$/.test(file.mimetype))})
const certificateTemplateUpload=multer({storage:multer.diskStorage({destination:uploadDirectory,filename:(_req,file,cb)=>cb(null,`${randomUUID()}${extname(file.originalname).toLowerCase()}`)}),limits:{fileSize:10*1024*1024,files:1},fileFilter:(_req,file,cb)=>cb(null,['.pdf','.png','.jpg','.jpeg'].includes(extname(file.originalname).toLowerCase()))})
const execFileAsync=promisify(execFile)
const certificatePython=process.env.PYTHON_EXECUTABLE??join(process.env.USERPROFILE??'','.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe')
const initialEmployeePassword=()=>process.env.INITIAL_EMPLOYEE_PASSWORD||`${randomUUID()}${randomUUID()}`
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
const employeeUsername=(employeeNo:string)=>employeeNo.trim().split('-').filter(Boolean).at(-1)?.trim()||employeeNo.trim()
const roleKeyFromName=(name:string)=>name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,30)
const createEmployeeUser=async(query:{query:(text:string,values?:unknown[])=>Promise<{rows:Record<string,unknown>[];rowCount:number|null}>},employeeId:string|string[],employeeNo:string,email:string,passwordHash:string)=>{
  const normalizedEmployeeId=String(employeeId);const base=employeeUsername(employeeNo);let username=base;let suffix=2
  while((await query.query('SELECT 1 FROM users WHERE lower(username)=lower($1) AND employee_id<>$2',[username,normalizedEmployeeId])).rowCount)username=`${base}-${suffix++}`
  await query.query(`INSERT INTO users(employee_id,email,username,password_hash,role) VALUES($1,$2,$3,$4,'employee') ON CONFLICT(employee_id) DO UPDATE SET username=CASE WHEN users.role='admin' THEN users.username ELSE EXCLUDED.username END,email=EXCLUDED.email,is_active=true`,[normalizedEmployeeId,email,username,passwordHash])
}
const corporateApprovalStepsSql=`SELECT aws.step_order,aws.step_name,CASE WHEN aws.request_type IN ('payment','taxi_charge','advance_clearance','vehicle_request') AND aws.step_order=1 THEN COALESCE(report_to_user.id,aws.approver_user_id) ELSE aws.approver_user_id END approver_user_id,COALESCE(CASE WHEN aws.request_type IN ('payment','taxi_charge','advance_clearance','vehicle_request') AND aws.step_order=1 THEN COALESCE(NULLIF(trim(report_to_employee.first_name||' '||report_to_employee.last_name),''),report_to_user.username) END,NULLIF(trim(fixed_employee.first_name||' '||fixed_employee.last_name),''),fixed_user.username) approver_name,COALESCE(CASE WHEN aws.request_type IN ('payment','taxi_charge','advance_clearance','vehicle_request') AND aws.step_order=1 THEN report_to_user.username END,fixed_user.username) username,a.action,a.comment,a.acted_at FROM approval_workflow_steps aws JOIN employees requester ON requester.id=$4 LEFT JOIN employees report_to_employee ON report_to_employee.id=requester.manager_id LEFT JOIN users report_to_user ON report_to_user.employee_id=report_to_employee.id AND report_to_user.is_active=true LEFT JOIN users fixed_user ON fixed_user.id=aws.approver_user_id LEFT JOIN employees fixed_employee ON fixed_employee.id=fixed_user.employee_id LEFT JOIN corporate_approval_actions a ON a.corporate_request_id=$3 AND a.step_order=aws.step_order WHERE aws.company_id=$1 AND aws.request_type=$2 ORDER BY aws.step_order`
const corporateWorkflowType=(request:Record<string,unknown>)=>request.request_type==='payment'&&String(detailsRecord(request.details).paymentType??'').toLowerCase()==='taxi charge'?'taxi_charge':String(request.request_type)
const getCorporateApprovalSteps=async(query:{query:(text:string,values?:unknown[])=>Promise<{rows:Record<string,unknown>[]}>},request:Record<string,unknown>)=>(await query.query(corporateApprovalStepsSql,[request.company_id,corporateWorkflowType(request),request.id,request.employee_id])).rows
const detailsRecord=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
const isTransportationStep=(step:Record<string,unknown>|undefined)=>String(step?.step_name??'').toLowerCase().includes('transportation')
const assignedVehicleFrom=(details:Record<string,unknown>)=>detailsRecord(details.assignedVehicle)
const corporateTrackingColumns=(stepName:unknown)=>{const name=String(stepName??'').toLowerCase();if(name.includes('department'))return['department_head_status','department_head_comments','department_responded_at','department_head_approver_name'];if(name.includes('transportation'))return['transportation_supervisor_status','transportation_supervisor_comments','transportation_supervisor_responded_at','transportation_supervisor_name'];if(name.includes('finance'))return['finance_approver_status','finance_approver_comments','finance_approver_responded_at','finance_approver_name'];if(name.includes('cashier'))return['cashier_status','cashier_comments','cashier_responded_at','cashier_name'];if(name.includes('receiver'))return['receiver_status','receiver_comments','receiver_responded_at','receiver_name'];return null}

app.get('/health', asyncRoute(async (_req,res) => {
  const result = await db.query('SELECT now() AS database_time')
  res.json({ status: 'ok', database: 'connected', databaseTime: result.rows[0].database_time })
}))

app.post('/api/auth/login', asyncRoute(async (req,res) => {
  const input=z.object({username:z.string().min(1).optional(),email:z.string().min(1).optional(),password:z.string().min(1)}).refine(value=>value.username||value.email).parse(req.body);const login=input.username??input.email!
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
    db.query(`SELECT ((SELECT count(*) FROM requests WHERE status='pending')+(SELECT count(*) FROM corporate_requests c JOIN employees e ON e.id=c.employee_id JOIN approval_workflow_steps aws ON aws.company_id=e.company_id AND aws.request_type=CASE WHEN c.request_type='payment' AND lower(COALESCE(c.details->>'paymentType',''))='taxi charge' THEN 'taxi_charge' ELSE c.request_type END AND aws.step_order=c.current_step LEFT JOIN employees rte ON rte.id=e.manager_id LEFT JOIN users rtu ON rtu.employee_id=rte.id AND rtu.is_active=true WHERE c.status='pending' AND (CASE WHEN aws.request_type IN ('payment','taxi_charge','advance_clearance','vehicle_request') AND aws.step_order=1 THEN COALESCE(rtu.id,aws.approver_user_id) ELSE aws.approver_user_id END)=$1))::int total`,[_req.user!.id]),
    db.query(`SELECT min(trim(d.name)) AS department_name,count(DISTINCT e.id)::int employees,count(DISTINCT a.employee_id) FILTER(WHERE a.status IN ('present','late'))::int present FROM employees e JOIN departments d ON d.id=e.department_id LEFT JOIN attendance a ON a.employee_id=e.id AND a.work_date=CURRENT_DATE WHERE e.employment_status='active' AND e.employee_no NOT LIKE 'EMP-%' AND nullif(trim(d.name),'') IS NOT NULL GROUP BY lower(trim(d.name)) ORDER BY min(trim(d.name))`)
  ])
  const total=employees.rows[0].total
  res.json({stats:{totalEmployees:total,presentToday:attendance.rows[0].present,lateToday:attendance.rows[0].late,pendingApprovals:pending.rows[0].total},departments:departments.rows.map(d=>({name:d.department_name,employees:d.employees,present:d.present,rate:d.employees?Math.round(d.present/d.employees*100):0}))})
}))

app.get('/api/employees', auth, asyncRoute(async (req,res) => {
  const viewer=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const result=await db.query(`SELECT e.id,e.employee_no,e.first_name,e.last_name,e.email,u.username,e.position,e.organization,e.project_location,e.work_location,e.employment_status,e.created_at,d.name department,COALESCE(NULLIF(trim(m.first_name||' '||m.last_name),''),m.employee_no) report_to FROM employees e LEFT JOIN users u ON u.employee_id=e.id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN employees m ON m.id=e.manager_id WHERE e.company_id=$1 AND e.employment_status='active' AND ($2::text IS NULL OR e.first_name ILIKE '%'||$2||'%' OR e.last_name ILIKE '%'||$2||'%' OR e.employee_no ILIKE '%'||$2||'%') ORDER BY e.created_at DESC LIMIT 1000`,[viewer.company_id,typeof req.query.q==='string'?req.query.q:null])
  res.json(result.rows)
}))

const employeeColumns=[
  ['Sr No','sr_no',10],['Employee ID','employee_no',16],['Employee Name (Eng)','name_eng',24],['Employee Name (MM)','name_mm',24],['Position','position',22],['Department','department',22],['Organization','organization',22],['Project Location','project_location',22],['NRC No (MM)','nrc_no_mm',20],['NRC No (Eng)','nrc_no_eng',20],['DOB(Eng)','date_of_birth',15],['Age','age',10],['Join Date','joined_on',15],['Permanent Date','permanent_date',15],['Service Year','service_year',14],['Gender','gender',12],['Blood Type','blood_type',12],['Father Name','father_name',22],['Marital Status','marital_status',16],['Has Children','has_children',14],['Number of Children','number_of_children',18],['Nationality','nationality',16],['Education','education',24],['Other Qualification','other_qualification',24],['Personal Phone No','phone',19],['Business Phone No','business_phone_no',19],['Business Email','business_email',28],['Current Address','current_address',32],['Probation/Permanent','employment_type',20],['Branch','branch',18],['Resign/Retired/Terminate (Date)','separation_date',28],['Report To','report_to',22],['Shift (Yes/No)','shift_required',16],['Bank Account / Pay Number','bank_account_pay_number',26]
] as const

const normalizeEmployeeHeader=(value:unknown)=>String(value??'').trim().toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'')
const employeeHeaderAliasEntries:Record<string,string[]>={
  'Employee Name (Eng)':['Employee Name (English)','Employee Name Eng','Employee Name English'],
  'Employee Name (MM)':['Employee Name (Myanmar)','Employee Name MM','Employee Name Myanmar'],
  'NRC No (Eng)':['NRC No (English)','NRC Number (Eng)','NRC Number (English)'],
  'NRC No (MM)':['NRC No (Myanmar)','NRC Number (MM)','NRC Number (Myanmar)'],
  'DOB(Eng)':['DOB (Eng)','DOB (English)','Date of Birth','Date of Birth (Eng)','Date of Birth (English)'],
  'Personal Phone No':['Personal Phone Number','Personal Phone'],
  'Business Phone No':['Business Phone Number','Business Phone'],
  'Resign/Retired/Terminate (Date)':['Resign/Retired/Terminated (Date)','Resign Retired Terminate Date','Separation Date'],
  'Bank Account / Pay Number':['Bank Account/Pay Number','Bank Account Number','Pay Number']
}
const employeeHeaderAliases=new Map<string,string>()
for(const [header] of employeeColumns){
  employeeHeaderAliases.set(normalizeEmployeeHeader(header),header.toLowerCase())
  for(const alias of employeeHeaderAliasEntries[header]??[])employeeHeaderAliases.set(normalizeEmployeeHeader(alias),header.toLowerCase())
}
const employeeImportErrorMessage=(error:unknown)=>{
  const databaseError=error as {code?:string;column?:string;constraint?:string;message?:string}
  if(databaseError.code==='23505')return `Duplicate value conflicts with ${databaseError.constraint??'an existing employee record'}`
  if(databaseError.code==='22001')return `Value is too long${databaseError.column?` for ${databaseError.column}`:''}`
  if(databaseError.code==='22007'||databaseError.code==='22008')return 'Invalid date value'
  if(databaseError.code==='23514')return `Value fails validation${databaseError.constraint?` (${databaseError.constraint})`:''}`
  return (databaseError.message??'Unable to import this employee').slice(0,300)
}
const prepareEmployeeImportEmail=async(query:{query:(text:string,values?:unknown[])=>Promise<{rows:Record<string,unknown>[];rowCount?:number|null}>},companyId:string,targetEmployeeId:string|null,loginEmail:string)=>{
  const conflict=(await query.query(`SELECT e.id,e.company_id,u.id user_id FROM employees e LEFT JOIN users u ON u.employee_id=e.id WHERE lower(e.email)=lower($1) AND ($2::uuid IS NULL OR e.id<>$2) LIMIT 1`,[loginEmail,targetEmployeeId])).rows[0]
  if(!conflict)return null
  if(String(conflict.company_id)!==companyId)throw Object.assign(new Error('Email is already assigned to an employee in another company'),{code:'EMPLOYEE_EMAIL_COMPANY_CONFLICT'})
  const archiveKey=String(conflict.id).replaceAll('-','').slice(0,20);const archiveEmail=`archived-${archiveKey}@employee.local`
  await query.query(`UPDATE employees SET email=$1,employment_status='inactive',separation_date=COALESCE(separation_date,CURRENT_DATE),updated_at=now() WHERE id=$2`,[archiveEmail,conflict.id])
  return conflict.user_id?String(conflict.user_id):null
}
const attachEmployeeImportUser=async(query:{query:(text:string,values?:unknown[])=>Promise<{rows:Record<string,unknown>[];rowCount?:number|null}>},userId:string|null,employeeId:string,loginEmail:string)=>{
  if(!userId)return
  const targetUser=(await query.query('SELECT id FROM users WHERE employee_id=$1',[employeeId])).rows[0]
  if(targetUser&&String(targetUser.id)!==userId){const archiveKey=userId.replaceAll('-','').slice(0,20);await query.query('UPDATE users SET email=$1,is_active=false WHERE id=$2',[`archived-user-${archiveKey}@employee.local`,userId]);return}
  await query.query('UPDATE users SET employee_id=$1,email=$2,is_active=true WHERE id=$3',[employeeId,loginEmail,userId])
}

const employeeWorkbook=async(rows?:Record<string,unknown>[])=>{
  const workbook=new ExcelJS.Workbook();workbook.creator='Company Portal';const sheet=workbook.addWorksheet('Employees',{views:[{state:'frozen',ySplit:1,xSplit:2}]})
  sheet.columns=employeeColumns.map(([header,key,width])=>({header,key,width}))
  sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF6554DC'}};cell.alignment={vertical:'middle',wrapText:true};cell.border={bottom:{style:'thin',color:{argb:'FF493AAE'}}}});sheet.getRow(1).height=34;sheet.autoFilter=`A1:${sheet.getColumn(employeeColumns.length).letter}1`
  if(rows?.length)rows.forEach((row,index)=>sheet.addRow({...row,sr_no:index+1}));else sheet.addRow({sr_no:1,employee_no:'EMP-0006',name_eng:'Example Employee',name_mm:'နမူနာ ဝန်ထမ်း',position:'Software Engineer',department:'Engineering',organization:'Head Office',project_location:'Yangon',nrc_no_mm:'',nrc_no_eng:'',date_of_birth:'1995-01-15',age:31,joined_on:'2024-01-01',permanent_date:'2024-04-01',service_year:2.5,gender:'Male',blood_type:'O+',father_name:'',marital_status:'Single',has_children:'No',number_of_children:0,nationality:'Myanmar',education:'Bachelor Degree',other_qualification:'',phone:'09xxxxxxxxx',business_phone_no:'',business_email:'example@company.local',current_address:'Yangon',employment_type:'Permanent',branch:'Yangon',separation_date:'',report_to:'EMP-0001',shift_required:'No',bank_account_pay_number:''})
  const textKeys=['employee_no','nrc_no_mm','nrc_no_eng','phone','business_phone_no','bank_account_pay_number'];textKeys.forEach(key=>sheet.getColumn(key).numFmt='@')
  const dateKeys=['date_of_birth','joined_on','permanent_date','separation_date'];dateKeys.forEach(key=>sheet.getColumn(key).numFmt='yyyy-mm-dd')
  sheet.getColumn('gender').eachCell((cell,row)=>{if(row>1)cell.dataValidation={type:'list',allowBlank:true,formulae:['"Male,Female,Other"']}});for(const key of ['has_children','shift_required'])sheet.getColumn(key).eachCell((cell,row)=>{if(row>1)cell.dataValidation={type:'list',allowBlank:true,formulae:['"Yes,No"']}})
  const instructions=workbook.addWorksheet('Instructions');instructions.columns=[{width:32},{width:90}];instructions.addRows([['Field','Instructions'],['Employee ID','Required and unique. Example: EMP-0006'],['Employee Name (Eng)','Required'],['Department','Must exactly match an existing department name'],['Date columns','Use DD-MM-YYYY (for example 15-01-1995) or YYYY-MM-DD. Excel date cells are also accepted.'],['Yes/No columns','Use Yes or No only'],['NRC / Phone / Bank','Formatted as text to preserve leading zeroes'],['Business Email','Optional; if present it must be a valid unique email'],['Import notes','Keep the Employees sheet and required columns. Common header variants such as DOB (English) and Employee Name (English) are accepted. Remove the example row before entering real data. Existing Employee IDs are updated; new IDs are inserted.']]);instructions.getRow(1).font={bold:true}
  return workbook
}

app.get('/api/employees/template', auth, asyncRoute(async (_req,res) => {const buffer=await (await employeeWorkbook()).xlsx.writeBuffer();res.setHeader('Content-Disposition','attachment; filename="employee-import-template.xlsx"');res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buffer))}))

app.get('/api/employees/export', auth, asyncRoute(async (_req,res) => {const result=await db.query(`SELECT e.employee_no,trim(e.first_name||' '||e.last_name) name_eng,e.name_mm,e.position,d.name department,e.organization,e.project_location,e.nrc_no_mm,e.nrc_no_eng,e.date_of_birth,COALESCE(e.age,EXTRACT(YEAR FROM age(CURRENT_DATE,e.date_of_birth))::int) age,e.joined_on,e.permanent_date,COALESCE(e.service_year,round((CURRENT_DATE-e.joined_on)/365.25,2)) service_year,e.gender,e.blood_type,e.father_name,e.marital_status,CASE WHEN e.has_children THEN 'Yes' WHEN e.has_children=false THEN 'No' END has_children,e.number_of_children,e.nationality,e.education,e.other_qualification,e.phone,e.business_phone_no,e.business_email,e.current_address,e.employment_type,e.branch,e.separation_date,COALESCE(m.employee_no,trim(m.first_name||' '||m.last_name)) report_to,CASE WHEN e.shift_required THEN 'Yes' WHEN e.shift_required=false THEN 'No' END shift_required,e.bank_account_pay_number FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN employees m ON m.id=e.manager_id ORDER BY e.employee_no`);const buffer=await (await employeeWorkbook(result.rows)).xlsx.writeBuffer();res.setHeader('Content-Disposition',`attachment; filename="employees-${new Date().toISOString().slice(0,10)}.xlsx"`);res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buffer))}))

app.post('/api/employees/import',auth,upload.single('file'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});if(!req.file)return res.status(400).json({error:'An .xlsx file is required'});const mode=z.enum(['merge','full_sync']).catch('merge').parse(req.query.mode)
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(req.file.buffer as unknown as ExcelJS.Buffer);const sheet=workbook.getWorksheet('Employees')??workbook.worksheets[0];if(!sheet)return res.status(400).json({error:'Employees worksheet not found'})
  const headers=new Map<string,number>();sheet.getRow(1).eachCell((cell,col)=>{const canonical=employeeHeaderAliases.get(normalizeEmployeeHeader(cell.text||cell.value));if(canonical&&!headers.has(canonical))headers.set(canonical,col)});const required=employeeColumns.map(([header])=>header.toLowerCase());const missing=required.filter(h=>!headers.has(h));if(missing.length)return res.status(400).json({error:`Missing columns: ${missing.map(key=>employeeColumns.find(([header])=>header.toLowerCase()===key)?.[0]??key).join(', ')}`})
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const departments=await db.query('SELECT id,lower(name) AS lower_name FROM departments WHERE company_id=$1',[company.company_id]);const depMap=new Map(departments.rows.map(d=>[d.lower_name,d.id]));const errors:{row:number;message:string}[]=[];let imported=0,updated=0,reactivated=0,deactivated=0,syncSkipped=false;const protectedEmployees:{employeeNo:string;reason:string}[]=[];const seenEmployeeNos=new Set<string>();const client=await db.connect();const defaultPasswordHash=await bcrypt.hash(initialEmployeePassword(),12)
  try{await client.query('BEGIN');for(let row=2;row<=sheet.rowCount;row++){await client.query('SAVEPOINT employee_import_row');try{
    const cell=(header:string)=>sheet.getRow(row).getCell(headers.get(header.toLowerCase())??0);const value=(header:string)=>String(cell(header).text??'').trim();const emptyDate=(text:string)=>['','-','--','—','–','n/a','na','nil','none','active','still working'].includes(text.trim().toLowerCase());const dateValue=(header:string)=>{const raw=cell(header).value;if(raw instanceof Date)return raw.toISOString().slice(0,10);if(typeof raw==='number'&&raw>20000){const excelDate=new Date(Math.round((raw-25569)*86400*1000));return excelDate.toISOString().slice(0,10)}const text=value(header).replace(/[–—]/g,'-').replace(/^'/,'').trim();if(emptyDate(text))return null;if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;const match=text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);if(match){const day=Number(match[1]),month=Number(match[2]),year=Number(match[3]);if(day>=1&&day<=31&&month>=1&&month<=12)return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`}return null};const numberValue=(header:string)=>{const text=value(header);if(text==='')return null;const parsed=Number(text);return Number.isFinite(parsed)?parsed:null};const yesNo=(header:string)=>{const text=value(header).toLowerCase();return ['yes','y','true','1'].includes(text)?true:['no','n','false','0'].includes(text)?false:null}
    const employeeNo=value('Employee ID'),nameEng=value('Employee Name (Eng)'),rawBusinessEmail=value('Business Email'),businessEmail=(rawBusinessEmail.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]??'').toLowerCase();if(!employeeNo&&!nameEng)continue;if(!employeeNo||!nameEng){errors.push({row,message:'Employee ID and Employee Name (Eng) are required'});continue}const department=value('Department');let departmentId=department?depMap.get(department.toLowerCase()):null;if(department&&!departmentId){const created=await client.query(`INSERT INTO departments(company_id,name,code) VALUES($1,$2,$3) RETURNING id`,[company.company_id,department,`IMP-${Date.now().toString().slice(-7)}-${row}`]);departmentId=created.rows[0].id;depMap.set(department.toLowerCase(),departmentId)}const dateHeaders=['DOB(Eng)','Join Date','Permanent Date','Resign/Retired/Terminate (Date)'];const invalidDate=dateHeaders.find(header=>!emptyDate(value(header))&&!dateValue(header));if(invalidDate){errors.push({row,message:`${invalidDate} must use YYYY-MM-DD, DD-MM-YYYY or DD/MM/YYYY`});continue}
    for(const [itemType,itemName] of [['organization',value('Organization')],['project_location',value('Project Location')],['branch',value('Branch')]])if(itemName)await client.query(`INSERT INTO hr_master_items(company_id,item_type,name,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,item_type,name) DO UPDATE SET is_active=true,updated_at=now()`,[company.company_id,itemType,itemName,req.user!.id]);const managerText=value('Report To');const manager=managerText?(await client.query(`SELECT id FROM employees WHERE company_id=$1 AND (employee_no=$2 OR lower(trim(first_name||' '||last_name))=lower($2)) LIMIT 1`,[company.company_id,managerText])).rows[0]:null;const internalEmail=businessEmail||`${employeeNo.toLowerCase().replace(/[^a-z0-9._-]/g,'')}@employee.local`;seenEmployeeNos.add(employeeNo.toLowerCase());const existing=await client.query('SELECT id,employment_status FROM employees WHERE company_id=$1 AND lower(employee_no)=lower($2) LIMIT 1',[company.company_id,employeeNo]);const userToTransfer=await prepareEmployeeImportEmail(client,String(company.company_id),existing.rows[0]?String(existing.rows[0].id):null,internalEmail);const params=[company.company_id,departmentId??null,employeeNo,nameEng,value('Employee Name (MM)'),value('Position'),value('Organization'),value('Project Location'),value('NRC No (MM)'),value('NRC No (Eng)'),dateValue('DOB(Eng)'),numberValue('Age'),dateValue('Join Date'),dateValue('Permanent Date'),numberValue('Service Year'),value('Gender'),value('Blood Type'),value('Father Name'),value('Marital Status'),yesNo('Has Children'),numberValue('Number of Children'),value('Nationality'),value('Education'),value('Other Qualification'),value('Personal Phone No'),value('Business Phone No'),businessEmail||null,internalEmail,value('Current Address'),value('Probation/Permanent'),value('Branch'),dateValue('Resign/Retired/Terminate (Date)'),manager?.id??null,yesNo('Shift (Yes/No)'),value('Bank Account / Pay Number')]
    const wasReactivated=Boolean(existing.rowCount&&existing.rows[0].employment_status!=='active');let employeeId:string;if(existing.rowCount){await client.query(`UPDATE employees SET company_id=$1,department_id=$2,employee_no=$3,first_name=$4,last_name='',name_mm=$5,position=$6,organization=$7,project_location=$8,work_location=$8,nrc_no_mm=$9,nrc_no_eng=$10,date_of_birth=$11,age=$12,joined_on=$13,permanent_date=$14,service_year=$15,gender=$16,blood_type=$17,father_name=$18,marital_status=$19,has_children=$20,number_of_children=$21,nationality=$22,education=$23,other_qualification=$24,phone=$25,business_phone_no=$26,business_email=$27,email=$28,current_address=$29,employment_type=$30,branch=$31,separation_date=$32,manager_id=$33,shift_required=$34,bank_account_pay_number=$35,employment_status='active',updated_at=now() WHERE id=$36`,[...params,existing.rows[0].id]);employeeId=String(existing.rows[0].id)}else{const inserted=await client.query(`INSERT INTO employees(company_id,department_id,employee_no,first_name,name_mm,position,organization,project_location,work_location,nrc_no_mm,nrc_no_eng,date_of_birth,age,joined_on,permanent_date,service_year,gender,blood_type,father_name,marital_status,has_children,number_of_children,nationality,education,other_qualification,phone,business_phone_no,business_email,email,current_address,employment_type,branch,separation_date,manager_id,shift_required,bank_account_pay_number) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35) RETURNING id`,params);employeeId=inserted.rows[0].id}await attachEmployeeImportUser(client,userToTransfer,employeeId,internalEmail);await createEmployeeUser(client,employeeId,employeeNo,internalEmail,defaultPasswordHash);await client.query('RELEASE SAVEPOINT employee_import_row');if(existing.rowCount)updated++;else imported++;if(wasReactivated)reactivated++}catch(error){await client.query('ROLLBACK TO SAVEPOINT employee_import_row');await client.query('RELEASE SAVEPOINT employee_import_row');errors.push({row,message:employeeImportErrorMessage(error)})}
  }for(let row=2;row<=sheet.rowCount;row++){const rowValue=(header:string)=>String(sheet.getRow(row).getCell(headers.get(header.toLowerCase())??0).text??'').trim();const employeeNo=rowValue('Employee ID'),managerText=rowValue('Report To');if(employeeNo&&managerText)await client.query(`UPDATE employees target SET manager_id=manager.id FROM employees manager WHERE target.company_id=$3 AND manager.company_id=$3 AND target.employee_no=$1 AND target.id<>manager.id AND (manager.employee_no=$2 OR lower(trim(manager.first_name||' '||manager.last_name))=lower($2))`,[employeeNo,managerText,company.company_id])}
    if(mode==='full_sync'){
      if(errors.length||!seenEmployeeNos.size)syncSkipped=true
      else{
        const seen=Array.from(seenEmployeeNos);const candidates=await client.query(`SELECT e.id,e.employee_no,CASE WHEN e.id=$3 THEN 'Current signed-in account' WHEN EXISTS(SELECT 1 FROM employees reportee WHERE reportee.company_id=e.company_id AND reportee.manager_id=e.id AND reportee.employment_status='active' AND lower(reportee.employee_no)=ANY($2::text[])) THEN 'Report To for an imported active employee' WHEN EXISTS(SELECT 1 FROM users u WHERE u.employee_id=e.id AND (EXISTS(SELECT 1 FROM requests r WHERE r.current_approver_id=u.id AND r.status='pending') OR EXISTS(SELECT 1 FROM corporate_requests cr WHERE cr.approver_id=u.id AND cr.status='pending') OR EXISTS(SELECT 1 FROM approval_workflow_steps aws WHERE aws.approver_user_id=u.id))) THEN 'Assigned to an approval workflow' END reason FROM employees e WHERE e.company_id=$1 AND e.employment_status='active' AND NOT(lower(e.employee_no)=ANY($2::text[]))`,[company.company_id,seen,req.user!.employeeId]);const deactivationIds:string[]=[];for(const candidate of candidates.rows){if(candidate.reason)protectedEmployees.push({employeeNo:String(candidate.employee_no),reason:String(candidate.reason)});else deactivationIds.push(String(candidate.id))}if(deactivationIds.length){await client.query(`UPDATE users SET is_active=false WHERE employee_id=ANY($1::uuid[])`,[deactivationIds]);const deactivatedResult=await client.query(`UPDATE employees SET employment_status='inactive',separation_date=COALESCE(separation_date,CURRENT_DATE),updated_at=now() WHERE id=ANY($1::uuid[]) AND company_id=$2 AND employment_status='active' RETURNING id`,[deactivationIds,company.company_id]);deactivated=deactivatedResult.rowCount??0}
      }
    }
    await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  res.json({mode,imported,updated,reactivated,deactivated,protected:protectedEmployees.length,protectedEmployees:protectedEmployees.slice(0,50),syncSkipped,skipped:errors.length,errors:errors.slice(0,50)})
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
    const menuKeys=['Overview','Approvals','Announcements','Notification','Human Resource','Employees','Attendance','Leave','Overtime','Appraisals','Learning Management','Corporate','Payment Request Form','Advance Clearance Request Form','Material Request Form','Service Request Form','Stationary Request Form','Vehicle Request Form','Fleet Management','Vehicle Management (Internal)','Vehicle Management (Maintenance)','Ferry Management','Information Technology','IT Asset Management','IT Asset Transfer Form','IT Asset Write Out Form','Admin','Reports','HR Management','Attendance Report','Leave Report','Overtime Report','Appraisals Report','Travelling Request Report','Asset Management','Admin Asset Report','IT Asset Report','Corporate Services','Payment Request Report','Advance Clearance Report','Service Request Report','Material Request Report','Stationary Request Report','Vehicle Request Report','Users & Roles','Role Access Control','Approval Setup','General Setting','Item Master','Banner','Settings','My Requests']
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
  if(req.user!.role!=='admin')return res.status(403).json({error:'Admin access required'});const input=z.object({newPassword:z.string().min(1).max(128),confirmPassword:z.string().min(1).max(128)}).refine(value=>value.newPassword===value.confirmPassword,{message:'Passwords do not match'}).parse(req.body);const hash=await bcrypt.hash(input.newPassword,12);const result=await db.query('UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING id',[hash,req.params.id]);if(!result.rowCount)return res.status(404).json({error:'User not found'});res.json({message:'Password reset successfully'})
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
  const optional=z.string().max(2000).optional().default('');const input=z.object({employeeNo:z.string().min(2).max(30),nameEng:z.string().min(1).max(180),nameMm:optional,position:optional,department:optional,organization:optional,projectLocation:optional,nrcNoMm:optional,nrcNoEng:optional,dob:optional,age:optional,joinDate:optional,probationDate:optional,permanentDate:optional,serviceYear:optional,gender:optional,bloodType:optional,fatherName:optional,maritalStatus:optional,hasChildren:optional,numberOfChildren:optional,nationality:optional,education:optional,otherQualification:optional,personalPhone:optional,businessPhone:optional,businessEmail:optional,currentAddress:optional,employmentType:optional,branch:optional,separationDate:optional,reportTo:optional,shiftRequired:optional,bankAccountPayNumber:optional}).parse(req.body)
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const department=input.department?(await db.query('SELECT id FROM departments WHERE company_id=$1 AND lower(name)=lower($2)',[company.company_id,input.department])).rows[0]:null;if(input.department&&!department)return res.status(400).json({error:`Unknown department: ${input.department}`})
  const manager=input.reportTo?(await db.query(`SELECT id FROM employees WHERE company_id=$1 AND (employee_no=$2 OR lower(trim(first_name||' '||last_name))=lower($2)) LIMIT 1`,[company.company_id,input.reportTo])).rows[0]:null;const email=input.businessEmail||`${input.employeeNo.toLowerCase().replace(/[^a-z0-9._-]/g,'')}@employee.local`;if(input.businessEmail&&!/^\S+@\S+\.\S+$/.test(input.businessEmail))return res.status(400).json({error:'Business Email is invalid'})
  const number=(value:string)=>value===''?null:Number(value);const date=(value:string)=>value||null;const yesNo=(value:string)=>value==='Yes'?true:value==='No'?false:null
  const params=[company.company_id,department?.id??null,input.employeeNo,input.nameEng,input.nameMm,input.position,input.organization,input.projectLocation,input.nrcNoMm,input.nrcNoEng,date(input.dob),number(input.age),date(input.joinDate),date(input.probationDate),date(input.permanentDate),number(input.serviceYear),input.gender,input.bloodType,input.fatherName,input.maritalStatus,yesNo(input.hasChildren),number(input.numberOfChildren),input.nationality,input.education,input.otherQualification,input.personalPhone,input.businessPhone,input.businessEmail||null,email,input.currentAddress,input.employmentType,input.branch,date(input.separationDate),manager?.id??null,yesNo(input.shiftRequired),input.bankAccountPayNumber]
  const result=await db.query(`INSERT INTO employees(company_id,department_id,employee_no,first_name,name_mm,position,organization,project_location,work_location,nrc_no_mm,nrc_no_eng,date_of_birth,age,joined_on,probation_date,permanent_date,service_year,gender,blood_type,father_name,marital_status,has_children,number_of_children,nationality,education,other_qualification,phone,business_phone_no,business_email,email,current_address,employment_type,branch,separation_date,manager_id,shift_required,bank_account_pay_number) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36) RETURNING *`,params)
  await createEmployeeUser(db,result.rows[0].id,input.employeeNo,email,await bcrypt.hash(initialEmployeePassword(),12))
  res.status(201).json(result.rows[0])
}))

app.delete('/api/employees',auth,asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const input=z.object({ids:z.array(z.string().uuid()).min(1).max(1000)}).parse(req.body);const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const requestedIds=Array.from(new Set(input.ids));const deletableIds=requestedIds.filter(id=>id!==req.user!.employeeId);const skippedSelf=deletableIds.length!==requestedIds.length;if(!deletableIds.length)return res.json({removed:0,skippedSelf})
  const client=await db.connect();try{await client.query('BEGIN');await client.query(`UPDATE users SET is_active=false WHERE employee_id=ANY($1::uuid[]) AND employee_id IN (SELECT id FROM employees WHERE company_id=$2)`,[deletableIds,company.company_id]);const result=await client.query(`UPDATE employees SET employment_status='inactive',separation_date=COALESCE(separation_date,CURRENT_DATE),updated_at=now() WHERE company_id=$1 AND id=ANY($2::uuid[]) AND employment_status='active' RETURNING id`,[company.company_id,deletableIds]);await client.query('COMMIT');res.json({removed:result.rowCount??0,skippedSelf})}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}))

app.get('/api/employees/:id',auth,asyncRoute(async(req,res)=>{
  const privileged=['admin','hr','manager'].includes(req.user!.role);const result=await db.query(`SELECT e.*,d.name department,COALESCE(NULLIF(trim(m.first_name||' '||m.last_name),''),m.employee_no) report_to,to_char(e.date_of_birth,'YYYY-MM-DD') date_of_birth,to_char(e.joined_on,'YYYY-MM-DD') joined_on,to_char(e.probation_date,'YYYY-MM-DD') probation_date,to_char(e.permanent_date,'YYYY-MM-DD') permanent_date,to_char(e.separation_date,'YYYY-MM-DD') separation_date,CASE WHEN e.date_of_birth IS NOT NULL THEN EXTRACT(YEAR FROM age(CURRENT_DATE,e.date_of_birth))::int END age,CASE WHEN e.joined_on IS NOT NULL THEN round((CURRENT_DATE-e.joined_on)::numeric/365.2425,2) END service_year,COALESCE((SELECT json_agg(json_build_object('id',ea.id,'original_name',ea.original_name,'mime_type',ea.mime_type,'file_size',ea.file_size,'created_at',ea.created_at) ORDER BY ea.created_at DESC) FROM employee_attachments ea WHERE ea.employee_id=e.id),'[]') attachments FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN employees m ON m.id=e.manager_id WHERE e.id=$1 AND ($2::boolean OR e.id=$3)`,[req.params.id,privileged,req.user!.employeeId]);if(!result.rowCount)return res.status(404).json({error:'Employee not found'});res.json(result.rows[0])
}))

app.put('/api/employees/:id',auth,asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const optional=z.string().max(2000).optional().default('');const input=z.object({employeeNo:z.string().min(2).max(30),nameEng:z.string().min(1).max(180),nameMm:optional,position:optional,department:optional,organization:optional,projectLocation:optional,nrcNoMm:optional,nrcNoEng:optional,dob:optional,age:optional,joinDate:optional,probationDate:optional,permanentDate:optional,serviceYear:optional,gender:optional,bloodType:optional,fatherName:optional,maritalStatus:optional,hasChildren:optional,numberOfChildren:optional,nationality:optional,education:optional,otherQualification:optional,personalPhone:optional,businessPhone:optional,businessEmail:optional,currentAddress:optional,employmentType:optional,branch:optional,separationDate:optional,reportTo:optional,shiftRequired:optional,bankAccountPayNumber:optional}).parse(req.body);const current=(await db.query('SELECT company_id,email FROM employees WHERE id=$1',[req.params.id])).rows[0];if(!current)return res.status(404).json({error:'Employee not found'});const department=input.department?(await db.query('SELECT id FROM departments WHERE company_id=$1 AND lower(name)=lower($2)',[current.company_id,input.department])).rows[0]:null;if(input.department&&!department)return res.status(400).json({error:`Unknown department: ${input.department}`});const manager=input.reportTo?(await db.query(`SELECT id FROM employees WHERE company_id=$1 AND id<>$3 AND (employee_no=$2 OR lower(trim(first_name||' '||last_name))=lower($2)) LIMIT 1`,[current.company_id,input.reportTo,req.params.id])).rows[0]:null;if(input.businessEmail&&!/^\S+@\S+\.\S+$/.test(input.businessEmail))return res.status(400).json({error:'Business Email is invalid'});const number=(value:string)=>value===''?null:Number(value);const date=(value:string)=>value||null;const yesNo=(value:string)=>value==='Yes'?true:value==='No'?false:null;const email=input.businessEmail||current.email;const values=[department?.id??null,input.employeeNo,input.nameEng,input.nameMm,input.position,input.organization,input.projectLocation,input.nrcNoMm,input.nrcNoEng,date(input.dob),number(input.age),date(input.joinDate),date(input.probationDate),date(input.permanentDate),number(input.serviceYear),input.gender,input.bloodType,input.fatherName,input.maritalStatus,yesNo(input.hasChildren),number(input.numberOfChildren),input.nationality,input.education,input.otherQualification,input.personalPhone,input.businessPhone,input.businessEmail||null,email,input.currentAddress,input.employmentType,input.branch,date(input.separationDate),manager?.id??null,yesNo(input.shiftRequired),input.bankAccountPayNumber,req.params.id];const result=await db.query(`UPDATE employees SET department_id=$1,employee_no=$2,first_name=$3,last_name='',name_mm=$4,position=$5,organization=$6,project_location=$7,work_location=$7,nrc_no_mm=$8,nrc_no_eng=$9,date_of_birth=$10,age=$11,joined_on=$12,probation_date=$13,permanent_date=$14,service_year=$15,gender=$16,blood_type=$17,father_name=$18,marital_status=$19,has_children=$20,number_of_children=$21,nationality=$22,education=$23,other_qualification=$24,phone=$25,business_phone_no=$26,business_email=$27,email=$28,current_address=$29,employment_type=$30,branch=$31,separation_date=$32,manager_id=$33,shift_required=$34,bank_account_pay_number=$35,updated_at=now() WHERE id=$36 RETURNING *`,values);await createEmployeeUser(db,req.params.id,input.employeeNo,email,await bcrypt.hash(initialEmployeePassword(),12));res.json(result.rows[0])
}))

app.post('/api/employees/:id/attachments',auth,(req:AuthRequest,res,next)=>{if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});next()},employeeDocumentUpload.array('attachments',10),asyncRoute(async(req,res)=>{
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const employee=(await db.query('SELECT id FROM employees WHERE id=$1 AND company_id=$2',[req.params.id,company.company_id])).rows[0];if(!employee)return res.status(404).json({error:'Employee not found'});const files=(req.files as Express.Multer.File[])??[];if(!files.length)return res.status(400).json({error:'Select at least one supported document'});const inserted=[];for(const file of files){const result=await db.query(`INSERT INTO employee_attachments(employee_id,original_name,stored_name,mime_type,file_size,uploaded_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,original_name,mime_type,file_size,created_at`,[employee.id,file.originalname.slice(0,255),file.filename,file.mimetype||'application/octet-stream',file.size,req.user!.id]);inserted.push(result.rows[0])}res.status(201).json(inserted)
}))

app.get('/api/employees/:id/attachments/:attachmentId',auth,asyncRoute(async(req,res)=>{
  const privileged=['admin','hr','manager'].includes(req.user!.role);const file=(await db.query(`SELECT ea.* FROM employee_attachments ea JOIN employees e ON e.id=ea.employee_id WHERE ea.id=$1 AND ea.employee_id=$2 AND e.company_id=(SELECT company_id FROM employees WHERE id=$3) AND ($4::boolean OR e.id=$3)`,[req.params.attachmentId,req.params.id,req.user!.employeeId,privileged])).rows[0];if(!file)return res.status(404).json({error:'Employee attachment not found'});res.download(join(uploadDirectory,file.stored_name),file.original_name)
}))

app.delete('/api/employees/:id/attachments/:attachmentId',auth,asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const result=await db.query(`DELETE FROM employee_attachments ea USING employees e WHERE ea.id=$1 AND ea.employee_id=$2 AND e.id=ea.employee_id AND e.company_id=(SELECT company_id FROM employees WHERE id=$3) RETURNING ea.id,ea.stored_name`,[req.params.attachmentId,req.params.id,req.user!.employeeId]);if(!result.rowCount)return res.status(404).json({error:'Employee attachment not found'});try{unlinkSync(join(uploadDirectory,result.rows[0].stored_name))}catch{}res.json({removed:true})
}))

app.get('/api/departments', auth, asyncRoute(async (_req,res) => {
  const result=await db.query('SELECT id,name,code FROM departments WHERE is_active=true ORDER BY name')
  res.json(result.rows)
}))

app.get('/api/item-master',auth,asyncRoute(async(req,res)=>{
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const [departments,items]=await Promise.all([db.query(`SELECT id,'department' item_type,name,is_active FROM departments WHERE company_id=$1 AND is_active=true`,[company.company_id]),db.query(`SELECT id,item_type,name,is_active FROM hr_master_items WHERE company_id=$1 AND is_active=true`,[company.company_id])]);res.json([...departments.rows,...items.rows].sort((a,b)=>a.name.localeCompare(b.name)))
}))

app.post('/api/item-master',auth,asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const input=z.object({itemType:z.enum(['department','organization','project_location','branch']),name:z.string().min(2).max(180)}).parse(req.body);const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];if(input.itemType==='department'){const code=`D${Date.now().toString().slice(-7)}`;const result=await db.query(`INSERT INTO departments(company_id,name,code) VALUES($1,$2,$3) ON CONFLICT(company_id,code) DO UPDATE SET is_active=true RETURNING id,'department' item_type,name,is_active`,[company.company_id,input.name,code]);return res.status(201).json(result.rows[0])}const result=await db.query(`INSERT INTO hr_master_items(company_id,item_type,name,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,item_type,name) DO UPDATE SET is_active=true,updated_at=now() RETURNING *`,[company.company_id,input.itemType,input.name,req.user!.id]);res.status(201).json(result.rows[0])
}))

app.delete('/api/item-master/:type/:id',auth,asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const type=z.enum(['department','organization','project_location','branch']).parse(req.params.type);if(type==='department'){await db.query('UPDATE departments SET is_active=false WHERE id=$1',[req.params.id])}else await db.query('UPDATE hr_master_items SET is_active=false,updated_at=now() WHERE id=$1 AND item_type=$2',[req.params.id,type]);res.json({message:'Item removed'})
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

const nullableAssetDate=z.preprocess(value=>value===''||value===null||value===undefined?null:value,z.iso.date().nullable())
const nullableAssetPrice=z.preprocess(value=>value===''||value===null||value===undefined?null:Number(value),z.number().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable())
const itAssetTagPrefixes={Laptop:'LAP',PC:'PC',Printer:'PRT',Scanner:'SCN',Copier:'COP',Router:'RTR',Switch:'STH','Access Point':'AP',Monitor:'MNR',Rack:'RCK'} as const
const itAssetInputSchema=z.object({
  assetName:z.string().trim().min(1).max(180),assetTagCode:z.string().trim().max(100).optional().default(''),category:z.enum(['Hardware','Software']),
  brandManufacturer:z.string().trim().max(150).optional().default(''),modelName:z.string().trim().max(150).optional().default(''),serialNumber:z.string().trim().max(150).optional().default(''),
  assetType:z.enum(['Laptop','PC','Printer','Scanner','Copier','Router','Switch','Access Point','Monitor','Rack']),
  processorCpu:z.string().trim().max(180).optional().default(''),ramMemory:z.string().trim().max(120).optional().default(''),storage:z.string().trim().max(120).optional().default(''),gpu:z.string().trim().max(180).optional().default(''),operatingSystem:z.string().trim().max(180).optional().default(''),
  status:z.enum(['In Stock','Assigned','Under Maintenance','Retired','Disposed']),officeLocation:z.string().trim().max(180).optional().default(''),currentAssignedUser:z.string().trim().max(180).optional().default(''),department:z.string().trim().max(150).optional().default(''),
  purchaseDate:nullableAssetDate,purchasePrice:nullableAssetPrice,vendorSupplier:z.string().trim().max(180).optional().default(''),invoicePoNumber:z.string().trim().max(120).optional().default(''),warrantyExpiryDate:nullableAssetDate,barcode:z.string().trim().max(180).optional().default(''),qrCode:z.string().trim().max(300).optional().default('')
})
type ItAssetQuery={query:(text:string,values?:unknown[])=>Promise<{rows:Record<string,unknown>[];rowCount:number|null}>}
const generateItAssetTag=async(query:ItAssetQuery,companyId:string,assetType:keyof typeof itAssetTagPrefixes)=>{const prefix=itAssetTagPrefixes[assetType];await query.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`it-asset-tag:${companyId}:${prefix}`]);const nextResult=await query.query(`SELECT COALESCE(MAX(substring(asset_tag_code from $2)::integer),0)+1 AS next_number FROM it_assets WHERE company_id=$1 AND asset_tag_code ~* $3`,[companyId,`^${prefix}-([0-9]{6})$`,`^${prefix}-[0-9]{6}$`]);const next=Number(nextResult.rows[0]?.next_number??1);if(next>999999)throw new Error(`Asset Tag/Code range exhausted for ${assetType}`);return `${prefix}-${String(next).padStart(6,'0')}`}
const itAssetFields=`id,asset_name,asset_tag_code,category,brand_manufacturer,model_name,serial_number,asset_type,processor_cpu,ram_memory,storage,gpu,operating_system,status,office_location,current_assigned_user,department,purchase_date,purchase_price,vendor_supplier,invoice_po_number,warranty_expiry_date,barcode,qr_code,image_file,created_at,updated_at`
const itAssetValues=(input:z.infer<typeof itAssetInputSchema>)=>[input.assetName,input.assetTagCode,input.category,input.brandManufacturer,input.modelName,input.serialNumber,input.assetType,input.processorCpu,input.ramMemory,input.storage,input.gpu,input.operatingSystem,input.status,input.officeLocation,input.currentAssignedUser,input.department,input.purchaseDate,input.purchasePrice,input.vendorSupplier,input.invoicePoNumber,input.warrantyExpiryDate,input.assetTagCode,`IT-ASSET:${input.assetTagCode}`]
const itAssetDbColumns=['asset_name','asset_tag_code','category','brand_manufacturer','model_name','serial_number','asset_type','processor_cpu','ram_memory','storage','gpu','operating_system','status','office_location','current_assigned_user','department','purchase_date','purchase_price','vendor_supplier','invoice_po_number','warranty_expiry_date','barcode','qr_code']
const itAssetExcelColumns:[string,string,number][]=[
  ['Asset Name','asset_name',24],['Asset Tag/Code','asset_tag_code',19],['Category','category',18],['Brand/Manufacturer','brand_manufacturer',22],['Model Name','model_name',20],['Serial Number','serial_number',20],['Type','asset_type',18],['Processor (CPU)','processor_cpu',24],['RAM (Memory)','ram_memory',18],['Storage','storage',18],['GPU','gpu',22],['Operating System','operating_system',22],['Status','status',20],['Office Location','office_location',22],['Current Assigned User','current_assigned_user',24],['Department','department',20],['Purchase Date','purchase_date',17],['Purchase Price','purchase_price',17],['Vendor/Supplier','vendor_supplier',22],['Invoice/PO Number','invoice_po_number',20],['Warranty Expiry Date','warranty_expiry_date',21]
]
const createItAssetWorkbook=(rows:Record<string,unknown>[]=[])=>{
  const workbook=new ExcelJS.Workbook();workbook.creator='Company Portal';const sheet=workbook.addWorksheet('IT Assets',{views:[{state:'frozen',ySplit:1}]})
  sheet.addRow(itAssetExcelColumns.map(([label])=>label));const header=sheet.getRow(1);header.height=25;header.font={bold:true,color:{argb:'FFFFFFFF'}};header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF6554DC'}};header.alignment={vertical:'middle'}
  for(const row of rows)sheet.addRow(itAssetExcelColumns.map(([,key])=>row[key]??''));itAssetExcelColumns.forEach(([,key,width],index)=>{const column=sheet.getColumn(index+1);column.width=width;if(key.includes('date'))column.numFmt='yyyy-mm-dd';if(key==='purchase_price')column.numFmt='#,##0.00'})
  sheet.getColumn(3).eachCell((cell,row)=>{if(row>1)cell.dataValidation={type:'list',allowBlank:false,formulae:['"Hardware,Software"']}});sheet.getColumn(7).eachCell((cell,row)=>{if(row>1)cell.dataValidation={type:'list',allowBlank:false,formulae:['"Laptop,PC,Printer,Scanner,Copier,Router,Switch,Access Point,Monitor,Rack"']}});sheet.autoFilter={from:'A1',to:`${sheet.getColumn(itAssetExcelColumns.length).letter}1`};const instructions=workbook.addWorksheet('Instructions');instructions.columns=[{width:28},{width:95}];instructions.addRows([['IT Asset Excel Import','Use the IT Assets sheet. Asset Name is required. Asset Tag/Code may be blank.'],['Automatic Asset Tag','When Asset Tag/Code is blank, a unique Type-based code is generated automatically (for example LAP-000001).'],['Update matching','A provided existing Asset Tag/Code updates that asset. A blank code always creates a new asset.'],['Allowed Category','Hardware, Software'],['Allowed Type',"Laptop, PC, Printer, Scanner, Copier, Router, Switch, Access Point, Monitor, Rack"],['Allowed Status','In Stock, Assigned, Under Maintenance, Retired, Disposed'],['Images','Asset images are uploaded separately in the web app and are not imported from Excel.'],['Barcode / QR Code','Generated automatically from the final Asset Tag/Code after import.']]);instructions.getRow(1).font={bold:true,color:{argb:'FF6554DC'}}
  return workbook
}

app.get('/api/it-assets',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'IT Asset Management'))return res.status(403).json({error:'Permission denied: IT Asset Management'})
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const result=await db.query(`SELECT ${itAssetFields} FROM it_assets WHERE company_id=$1 AND is_active=true ORDER BY created_at DESC`,[company.company_id])
  res.json(result.rows)
}))
app.get('/api/it-assets/template',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'IT Asset Management'))return res.status(403).json({error:'Permission denied: IT Asset Management'})
  const workbook=createItAssetWorkbook();const buffer=await workbook.xlsx.writeBuffer();res.setHeader('Content-Disposition','attachment; filename="it-assets-template.xlsx"');res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buffer))
}))
app.get('/api/it-assets/export',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'IT Asset Management'))return res.status(403).json({error:'Permission denied: IT Asset Management'})
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const values:unknown[]=[company.company_id];const filters=['company_id=$1','is_active=true'];const add=(column:string,value:unknown)=>{values.push(value);filters.push(`${column}=$${values.length}`)}
  const search=String(req.query.search??'').trim();if(search){values.push(`%${search}%`);filters.push(`concat_ws(' ',asset_name,asset_tag_code,category,brand_manufacturer,model_name,serial_number,asset_type,status,office_location,current_assigned_user,department,vendor_supplier) ILIKE $${values.length}`)}
  if(req.query.category)add('category',String(req.query.category));if(req.query.type)add('asset_type',String(req.query.type));if(req.query.status)add('status',String(req.query.status))
  const rows=(await db.query(`SELECT ${itAssetFields} FROM it_assets WHERE ${filters.join(' AND ')} ORDER BY created_at DESC`,values)).rows;const workbook=createItAssetWorkbook(rows);const buffer=await workbook.xlsx.writeBuffer();res.setHeader('Content-Disposition',`attachment; filename="it-assets-${new Date().toISOString().slice(0,10)}.xlsx"`);res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buffer))
}))
app.post('/api/it-assets/import',auth,upload.single('file'),asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'IT Asset Management'))return res.status(403).json({error:'Permission denied: IT Asset Management'});if(!req.file)return res.status(400).json({error:'An .xlsx file is required'})
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(req.file.buffer as unknown as ExcelJS.Buffer);const sheet=workbook.getWorksheet('IT Assets')??workbook.worksheets[0];if(!sheet)return res.status(400).json({error:'IT Assets worksheet not found'})
  const headerIndexes=new Map<string,number>();sheet.getRow(1).eachCell((cell,index)=>headerIndexes.set(String(cell.text??cell.value??'').trim().toLowerCase(),index));const required=['asset name'];const missing=required.filter(header=>!headerIndexes.has(header));if(missing.length)return res.status(400).json({error:`Missing columns: ${missing.join(', ')}`})
  const cell=(row:number,label:string)=>{const index=headerIndexes.get(label.toLowerCase());return index?sheet.getRow(row).getCell(index):undefined};const value=(row:number,label:string)=>String(cell(row,label)?.text??'').trim();const dateValue=(row:number,label:string)=>{const raw=cell(row,label)?.value;if(raw instanceof Date)return raw.toISOString().slice(0,10);const entered=value(row,label);if(!entered)return null;if(/^\d{4}-\d{2}-\d{2}$/.test(entered))return entered;const parsed=new Date(entered);return Number.isNaN(parsed.valueOf())?entered:parsed.toISOString().slice(0,10)}
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];let imported=0,updated=0;const errors:{row:number;message:string}[]=[];const client=await db.connect()
  try{await client.query('BEGIN');for(let row=2;row<=sheet.rowCount;row++){const assetName=value(row,'Asset Name'),providedAssetTag=value(row,'Asset Tag/Code');if(!assetName&&!providedAssetTag)continue;const priceText=value(row,'Purchase Price').replace(/,/g,'');const parsed=itAssetInputSchema.safeParse({assetName,assetTagCode:providedAssetTag,category:value(row,'Category')||'Hardware',brandManufacturer:value(row,'Brand/Manufacturer'),modelName:value(row,'Model Name'),serialNumber:value(row,'Serial Number'),assetType:value(row,'Type')||'Laptop',processorCpu:value(row,'Processor (CPU)'),ramMemory:value(row,'RAM (Memory)'),storage:value(row,'Storage'),gpu:value(row,'GPU'),operatingSystem:value(row,'Operating System'),status:value(row,'Status')||'In Stock',officeLocation:value(row,'Office Location'),currentAssignedUser:value(row,'Current Assigned User'),department:value(row,'Department'),purchaseDate:dateValue(row,'Purchase Date'),purchasePrice:priceText?Number(priceText):null,vendorSupplier:value(row,'Vendor/Supplier'),invoicePoNumber:value(row,'Invoice/PO Number'),warrantyExpiryDate:dateValue(row,'Warranty Expiry Date')});if(!parsed.success){errors.push({row,message:parsed.error.issues.map(issue=>issue.message).join(', ')});continue}const existing=providedAssetTag?await client.query('SELECT id FROM it_assets WHERE company_id=$1 AND lower(asset_tag_code)=lower($2) ORDER BY is_active DESC,updated_at DESC LIMIT 1',[company.company_id,providedAssetTag]):{rowCount:0,rows:[]};const finalInput={...parsed.data,assetTagCode:providedAssetTag||await generateItAssetTag(client,company.company_id,parsed.data.assetType)};const params=itAssetValues(finalInput);if(existing.rowCount){const assignments=itAssetDbColumns.map((column,index)=>`${column}=$${index+1}`).join(',');await client.query(`UPDATE it_assets SET ${assignments},is_active=true,updated_at=now() WHERE id=$${params.length+1}`,[...params,existing.rows[0].id]);updated++}else{const placeholders=params.map((_,index)=>`$${index+2}`).join(',');await client.query(`INSERT INTO it_assets(company_id,${itAssetDbColumns.join(',')},created_by) VALUES($1,${placeholders},$${params.length+2})`,[company.company_id,...params,req.user!.id]);imported++}}await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  res.json({imported,updated,skipped:errors.length,errors:errors.slice(0,50)})
}))
app.post('/api/it-assets',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'IT Asset Management'))return res.status(403).json({error:'Permission denied: IT Asset Management'})
  const input=itAssetInputSchema.parse(req.body);const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const client=await db.connect();try{await client.query('BEGIN');const assetTagCode=input.assetTagCode||await generateItAssetTag(client,company.company_id,input.assetType);const duplicate=await client.query('SELECT 1 FROM it_assets WHERE company_id=$1 AND lower(asset_tag_code)=lower($2) AND is_active=true',[company.company_id,assetTagCode]);if(duplicate.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'Asset Tag/Code already exists'})}const finalInput={...input,assetTagCode};const values=itAssetValues(finalInput);const placeholders=values.map((_,index)=>`$${index+2}`).join(',');const result=await client.query(`INSERT INTO it_assets(company_id,asset_name,asset_tag_code,category,brand_manufacturer,model_name,serial_number,asset_type,processor_cpu,ram_memory,storage,gpu,operating_system,status,office_location,current_assigned_user,department,purchase_date,purchase_price,vendor_supplier,invoice_po_number,warranty_expiry_date,barcode,qr_code,created_by) VALUES($1,${placeholders},$${values.length+2}) RETURNING ${itAssetFields}`,[company.company_id,...values,req.user!.id]);await client.query('COMMIT');res.status(201).json(result.rows[0])}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}))
app.put('/api/it-assets/:id',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'IT Asset Management'))return res.status(403).json({error:'Permission denied: IT Asset Management'})
  const input=itAssetInputSchema.parse(req.body);const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const duplicate=await db.query('SELECT 1 FROM it_assets WHERE company_id=$1 AND lower(asset_tag_code)=lower($2) AND id<>$3 AND is_active=true',[company.company_id,input.assetTagCode,req.params.id]);if(duplicate.rowCount)return res.status(409).json({error:'Asset Tag/Code already exists'})
  const values=itAssetValues(input);const assignments=itAssetDbColumns.map((column,index)=>`${column}=$${index+1}`).join(',')
  const result=await db.query(`UPDATE it_assets SET ${assignments},updated_at=now() WHERE id=$${values.length+1} AND company_id=$${values.length+2} AND is_active=true RETURNING ${itAssetFields}`,[...values,req.params.id,company.company_id]);if(!result.rowCount)return res.status(404).json({error:'IT asset not found'})
  res.json(result.rows[0])
}))
app.post('/api/it-assets/write-off',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'IT Asset Management'))return res.status(403).json({error:'Permission denied: IT Asset Management'})
  const input=z.object({ids:z.array(z.string().uuid()).min(1).max(1000)}).parse(req.body)
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const client=await db.connect()
  try{
    await client.query('BEGIN')
    const assets=(await client.query(`SELECT ${itAssetFields} FROM it_assets WHERE company_id=$1 AND id=ANY($2::uuid[]) AND is_active=true FOR UPDATE`,[company.company_id,input.ids])).rows
    if(assets.length!==input.ids.length){await client.query('ROLLBACK');return res.status(404).json({error:'One or more selected IT assets were not found'})}
    const batchId=String((await client.query('SELECT gen_random_uuid() AS id')).rows[0].id)
    for(const asset of assets)await client.query('INSERT INTO it_asset_write_offs(batch_id,company_id,asset_id,asset_snapshot,written_off_by) VALUES($1,$2,$3,$4::jsonb,$5)',[batchId,company.company_id,asset.id,JSON.stringify(asset),req.user!.id])
    await client.query("UPDATE it_assets SET status='Disposed',updated_at=now() WHERE company_id=$1 AND id=ANY($2::uuid[]) AND is_active=true",[company.company_id,input.ids])
    await client.query('COMMIT')
    res.json({batchId,writtenOff:assets.length})
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}))
app.post('/api/it-assets/:id/image',auth,assetImageUpload.single('image'),asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'IT Asset Management'))return res.status(403).json({error:'Permission denied: IT Asset Management'})
  if(!req.file)return res.status(400).json({error:'A JPG, PNG or WebP asset image is required'})
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const result=await db.query(`UPDATE it_assets SET image_file=$1,updated_at=now() WHERE id=$2 AND company_id=$3 AND is_active=true RETURNING ${itAssetFields}`,[req.file.filename,req.params.id,company.company_id]);if(!result.rowCount)return res.status(404).json({error:'IT asset not found'})
  res.json(result.rows[0])
}))
app.get('/api/it-assets/:id/image',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'IT Asset Management'))return res.status(403).json({error:'Permission denied: IT Asset Management'})
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const asset=(await db.query('SELECT image_file FROM it_assets WHERE id=$1 AND company_id=$2 AND is_active=true',[req.params.id,company.company_id])).rows[0];if(!asset?.image_file)return res.status(404).json({error:'Asset image not found'})
  res.sendFile(join(uploadDirectory,asset.image_file))
}))
app.delete('/api/it-assets/:id',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'IT Asset Management'))return res.status(403).json({error:'Permission denied: IT Asset Management'})
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const result=await db.query('UPDATE it_assets SET is_active=false,updated_at=now() WHERE id=$1 AND company_id=$2 AND is_active=true RETURNING id',[req.params.id,company.company_id]);if(!result.rowCount)return res.status(404).json({error:'IT asset not found'});res.json({message:'IT asset deleted'})
}))
app.delete('/api/it-assets',auth,asyncRoute(async(req,res)=>{
  if(!await hasMenuAccess(req,'IT Asset Management'))return res.status(403).json({error:'Permission denied: IT Asset Management'});const input=z.object({ids:z.array(z.string().uuid()).min(1).max(1000)}).parse(req.body)
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const result=await db.query('UPDATE it_assets SET is_active=false,updated_at=now() WHERE company_id=$1 AND id=ANY($2::uuid[]) AND is_active=true RETURNING id',[company.company_id,input.ids]);res.json({removed:result.rowCount??0})
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
const vehicleWorkbook=async(category:string,rows?:Record<string,unknown>[])=>{
  const workbook=new ExcelJS.Workbook();workbook.creator='Company Portal';const sheet=workbook.addWorksheet('Vehicles',{views:[{state:'frozen',ySplit:1}]})
  sheet.columns=vehicleColumns(category).map(([header,key,width])=>({header,key,width}))
  sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF6554DC'}};cell.alignment={vertical:'middle',wrapText:true}});sheet.autoFilter=`A1:${sheet.getColumn(sheet.columnCount).letter}1`
  if(rows)rows.forEach(row=>sheet.addRow(row));else sheet.addRow(category==='maintenance'
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

app.get('/api/vehicles/export',auth,asyncRoute(async(req,res)=>{
  const category=vehicleCategoryFromRequest(req);const menuKey=vehiclePermissionKey(category);if(!await hasMenuAccess(req,menuKey))return res.status(403).json({error:`Permission denied: ${menuKey}`})
  const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0]
  const filter=(key:string)=>typeof req.query[key]==='string'?String(req.query[key]).trim():null
  const vehicleName=filter('vehicleName'),vehicleType=filter('vehicleType'),plateNumber=filter('plateNumber'),department=filter('department'),driverName=filter('driverName'),phoneNo=filter('phoneNo'),status=filter('status')
  const result=await db.query(`SELECT vehicle_name,vehicle_type,vehicle_plate_number,department,driver_name,phone_no,status FROM vehicles WHERE company_id=$1 AND vehicle_category=$2 AND is_active=true AND ($3::text IS NULL OR vehicle_name ILIKE '%'||$3||'%') AND ($4::text IS NULL OR vehicle_type ILIKE '%'||$4||'%') AND ($5::text IS NULL OR vehicle_plate_number ILIKE '%'||$5||'%') AND ($6::text IS NULL OR department ILIKE '%'||$6||'%') AND ($7::text IS NULL OR driver_name ILIKE '%'||$7||'%') AND ($8::text IS NULL OR phone_no ILIKE '%'||$8||'%') AND ($9::text IS NULL OR status=$9) ORDER BY created_at DESC`,[company.company_id,category,vehicleName||null,vehicleType||null,plateNumber||null,department||null,driverName||null,phoneNo||null,status||null])
  const buffer=await (await vehicleWorkbook(category,result.rows)).xlsx.writeBuffer();res.setHeader('Content-Disposition',`attachment; filename="${category}-vehicles-${new Date().toISOString().slice(0,10)}.xlsx"`);res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buffer))
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
    LEFT JOIN approval_workflow_steps aws ON aws.company_id=e.company_id AND aws.request_type=CASE WHEN c.request_type='payment' AND lower(COALESCE(c.details->>'paymentType',''))='taxi charge' THEN 'taxi_charge' ELSE c.request_type END AND aws.step_order=c.current_step
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
    FROM corporate_requests c JOIN employees e ON e.id=c.employee_id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN approval_workflow_steps aws ON aws.company_id=e.company_id AND aws.request_type=CASE WHEN c.request_type='payment' AND lower(COALESCE(c.details->>'paymentType',''))='taxi charge' THEN 'taxi_charge' ELSE c.request_type END AND aws.step_order=c.current_step LEFT JOIN employees rte ON rte.id=e.manager_id LEFT JOIN users rtu ON rtu.employee_id=rte.id AND rtu.is_active=true LEFT JOIN users pu ON pu.id=(CASE WHEN aws.request_type IN ('payment','taxi_charge','advance_clearance','vehicle_request') AND aws.step_order=1 THEN COALESCE(rtu.id,aws.approver_user_id) ELSE aws.approver_user_id END) LEFT JOIN employees pe ON pe.id=pu.employee_id WHERE c.employee_id=$1
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
    LEFT JOIN approval_workflow_steps aws ON aws.company_id=e.company_id AND aws.request_type=CASE WHEN c.request_type='payment' AND lower(COALESCE(c.details->>'paymentType',''))='taxi charge' THEN 'taxi_charge' ELSE c.request_type END AND aws.step_order=c.current_step AND c.status='pending'
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
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'Admin or HR access required'});const requestType=z.enum(['payment','taxi_charge','advance_clearance','vehicle_request']).parse(req.params.requestType);const input=z.object({steps:z.array(z.object({stepOrder:z.number().int().min(1).max(20),stepName:z.string().min(2).max(120),approverUserId:z.uuid().nullable().optional()})).min(1).max(20)}).parse(req.body);const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const client=await db.connect();try{await client.query('BEGIN');for(const step of input.steps)await client.query(`INSERT INTO approval_workflow_steps(company_id,request_type,step_order,step_name,approver_user_id,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(company_id,request_type,step_order) DO UPDATE SET step_name=$4,approver_user_id=$5,updated_by=$6,updated_at=now()`,[company.company_id,requestType,step.stepOrder,step.stepName,step.approverUserId??null,req.user!.id]);await client.query('COMMIT');res.json({message:'Approval workflow saved successfully'})}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
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
    db.query(`SELECT 1 FROM approval_workflow_steps WHERE approver_user_id=$1 UNION SELECT 1 FROM corporate_requests c JOIN employees e ON e.id=c.employee_id JOIN approval_workflow_steps aws ON aws.company_id=e.company_id AND aws.request_type=CASE WHEN c.request_type='payment' AND lower(COALESCE(c.details->>'paymentType',''))='taxi charge' THEN 'taxi_charge' ELSE c.request_type END AND aws.step_order=c.current_step LEFT JOIN employees rte ON rte.id=e.manager_id LEFT JOIN users rtu ON rtu.employee_id=rte.id AND rtu.is_active=true WHERE c.status='pending' AND (CASE WHEN aws.request_type IN ('payment','taxi_charge','advance_clearance','vehicle_request') AND aws.step_order=1 THEN COALESCE(rtu.id,aws.approver_user_id) ELSE aws.approver_user_id END)=$1 LIMIT 1`,[req.user!.id]),
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
  const type=typeof req.query.type==='string'?req.query.type:null;const privileged=['admin','hr'].includes(req.user!.role);const result=await db.query(`SELECT c.*,e.employee_no,trim(e.first_name||' '||e.last_name) employee_name,d.name employee_department,e.organization business_units,CASE WHEN c.status='pending' THEN COALESCE(NULLIF(trim(pe.first_name||' '||pe.last_name),''),pu.username,'Unassigned approver') ELSE NULL END pending_with FROM corporate_requests c JOIN employees e ON e.id=c.employee_id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN approval_workflow_steps aws ON aws.company_id=e.company_id AND aws.request_type=CASE WHEN c.request_type='payment' AND lower(COALESCE(c.details->>'paymentType',''))='taxi charge' THEN 'taxi_charge' ELSE c.request_type END AND aws.step_order=c.current_step LEFT JOIN employees rte ON rte.id=e.manager_id LEFT JOIN users rtu ON rtu.employee_id=rte.id AND rtu.is_active=true LEFT JOIN users pu ON pu.id=(CASE WHEN aws.request_type IN ('payment','taxi_charge','advance_clearance','vehicle_request') AND aws.step_order=1 THEN COALESCE(rtu.id,aws.approver_user_id) ELSE aws.approver_user_id END) LEFT JOIN employees pe ON pe.id=pu.employee_id WHERE ($1::text IS NULL OR c.request_type=$1) AND e.company_id=(SELECT company_id FROM employees WHERE id=$2) AND ($4::boolean OR c.employee_id=$2 OR (CASE WHEN aws.request_type IN ('payment','taxi_charge','advance_clearance','vehicle_request') AND aws.step_order=1 THEN COALESCE(rtu.id,aws.approver_user_id) ELSE aws.approver_user_id END)=$3) ORDER BY c.created_at DESC`,[type,req.user!.employeeId,req.user!.id,privileged]);res.json(result.rows)
}))

app.get('/api/corporate-requests/eligible-advances',auth,permitCorporateRequest,asyncRoute(async(req,res)=>{
  const result=await db.query(`SELECT c.id,c.reference_no,c.amount,c.currency,c.created_at,c.details FROM corporate_requests c WHERE c.employee_id=$1 AND c.request_type='payment' AND c.status='approved' AND lower(COALESCE(c.details->>'paymentType',''))='advance' AND NOT EXISTS(SELECT 1 FROM corporate_requests clearance WHERE clearance.employee_id=c.employee_id AND clearance.request_type='advance_clearance' AND clearance.status<>'rejected' AND clearance.details->>'paymentRequestId'=c.id::text) ORDER BY c.created_at DESC`,[req.user!.employeeId]);res.json(result.rows)
}))

app.get('/api/corporate-requests/advance-availability',auth,permitCorporateRequest,asyncRoute(async(req,res)=>{
  const outstanding=(await db.query(`SELECT payment.id,payment.reference_no,payment.status FROM corporate_requests payment WHERE payment.employee_id=$1 AND payment.request_type='payment' AND payment.status<>'rejected' AND lower(COALESCE(payment.details->>'paymentType',''))='advance' AND NOT EXISTS(SELECT 1 FROM corporate_requests clearance WHERE clearance.employee_id=payment.employee_id AND clearance.request_type='advance_clearance' AND clearance.status='approved' AND clearance.details->>'paymentRequestId'=payment.id::text) ORDER BY payment.created_at DESC LIMIT 1`,[req.user!.employeeId])).rows[0]??null;res.json({available:!outstanding,outstanding})
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
    const trackingColumns=corporateTrackingColumns(current.step_name)
    if(trackingColumns){const[statusColumn,commentsColumn,respondedColumn,nameColumn]=trackingColumns;await client.query(`UPDATE corporate_requests SET ${statusColumn}=$1,${commentsColumn}=$2,${respondedColumn}=now(),${nameColumn}=$3 WHERE id=$4`,[input.action,input.comment??null,approver?.approver_name??null,request.id])}
    if(request.request_type==='advance_clearance'&&input.action==='approved'&&String(current.step_name).toLowerCase().includes('cashier'))await client.query(`UPDATE corporate_requests SET advance_status='Advance Cleared' WHERE id=$1`,[request.id])
    if(request.request_type==='advance_clearance'&&nextStatus==='approved'){await client.query(`UPDATE corporate_requests SET advance_status='Advance Closed' WHERE id=$1`,[request.id]);const paymentRequestId=String(requestDetails.paymentRequestId??'');if(paymentRequestId)await client.query(`UPDATE corporate_requests SET advance_status='Cleared',updated_at=now() WHERE id=$1 AND request_type='payment'`,[paymentRequestId])}
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

app.post('/api/corporate-requests',auth,permitCorporateRequest,corporateRequestUpload,asyncRoute(async(req,res)=>{
  const rawDetails=typeof req.body.details==='string'?JSON.parse(req.body.details):req.body.details;const input=z.object({requestType:z.enum(['payment','advance_clearance','vehicle_request']),payee:z.string().max(180).optional().default(''),purpose:z.string().min(3).max(3000),amount:z.coerce.number().nonnegative(),currency:z.enum(['USD','EURO','CNY','MMK','THB']).default('MMK'),details:z.record(z.string(),z.unknown()).optional()}).parse({...req.body,details:rawDetails});const requester=(await db.query(`SELECT e.company_id,COALESCE(NULLIF(trim(m.first_name||' '||m.last_name),''),m.employee_no) manager_name,mu.id report_to_user_id FROM employees e LEFT JOIN employees m ON m.id=e.manager_id LEFT JOIN users mu ON mu.employee_id=m.id AND mu.is_active=true WHERE e.id=$1`,[req.user!.employeeId])).rows[0];if(!requester)return res.status(404).json({error:'Employee profile was not found'});if(input.requestType==='payment'&&String(input.details?.paymentType).toLowerCase()==='advance'){const outstanding=(await db.query(`SELECT payment.reference_no FROM corporate_requests payment WHERE payment.employee_id=$1 AND payment.request_type='payment' AND payment.status<>'rejected' AND lower(COALESCE(payment.details->>'paymentType',''))='advance' AND NOT EXISTS(SELECT 1 FROM corporate_requests clearance WHERE clearance.employee_id=payment.employee_id AND clearance.request_type='advance_clearance' AND clearance.status='approved' AND clearance.details->>'paymentRequestId'=payment.id::text) ORDER BY payment.created_at DESC LIMIT 1`,[req.user!.employeeId])).rows[0];if(outstanding)return res.status(409).json({error:`Clear outstanding Advance ${outstanding.reference_no} before requesting another Advance`})}if(input.requestType==='advance_clearance'){const paymentRequestId=z.string().uuid().parse(input.details?.paymentRequestId);const advance=(await db.query(`SELECT c.id,c.reference_no,c.amount,c.currency FROM corporate_requests c WHERE c.id=$1 AND c.employee_id=$2 AND c.request_type='payment' AND c.status='approved' AND lower(COALESCE(c.details->>'paymentType',''))='advance' AND NOT EXISTS(SELECT 1 FROM corporate_requests clearance WHERE clearance.employee_id=c.employee_id AND clearance.request_type='advance_clearance' AND clearance.status<>'rejected' AND clearance.details->>'paymentRequestId'=c.id::text)`,[paymentRequestId,req.user!.employeeId])).rows[0];if(!advance)return res.status(400).json({error:'Select an approved Advance Payment Request that has not been cleared'});const advanceAmount=z.coerce.number().nonnegative().parse(input.details?.advanceAmount),actualCost=z.coerce.number().nonnegative().parse(input.details?.actualCost),balance=advanceAmount-actualCost;input.amount=advanceAmount;input.currency=advance.currency;input.payee=advance.reference_no;input.details={...input.details,paymentRequestReference:advance.reference_no,advanceAmount,actualCost,balance,total:balance}}const configuredApprover=(await db.query(`SELECT approver_user_id id FROM approval_workflow_steps WHERE company_id=$1 AND request_type=$2 AND step_order=1`,[requester.company_id,input.requestType])).rows[0];const fallbackApprover=(await db.query(`SELECT id FROM users WHERE role IN ('manager','approver','hr','admin') AND is_active=true ORDER BY CASE role WHEN 'manager' THEN 1 WHEN 'approver' THEN 2 WHEN 'hr' THEN 3 ELSE 4 END LIMIT 1`)).rows[0];const usesDynamicDepartmentHead=['payment','advance_clearance','vehicle_request'].includes(input.requestType);const approver=usesDynamicDepartmentHead?{id:requester.report_to_user_id}:configuredApprover?.id?configuredApprover:fallbackApprover;if(usesDynamicDepartmentHead&&!approver.id)return res.status(400).json({error:`Report To approver is required before submitting this request${requester.manager_name?`: ${requester.manager_name} does not have an active user account`:'. Please update the employee Report To first.'}`});const prefix=input.requestType==='vehicle_request'?'VRF':input.requestType==='advance_clearance'?'ACF':'PRF';const approvalTitle=input.requestType==='vehicle_request'?'Vehicle request approval required':input.requestType==='advance_clearance'?'Advance clearance approval required':'Payment approval required';const reference=`${prefix}-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`;const client=await db.connect();try{await client.query('BEGIN');const result=await client.query(`INSERT INTO corporate_requests(employee_id,request_type,reference_no,payee,purpose,amount,currency,details,approver_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[req.user!.employeeId,input.requestType,reference,input.payee,input.purpose,input.amount,input.currency,input.details??{},approver?.id??null]);for(const file of ((req.files as Express.Multer.File[] | undefined)??[]))await client.query(`INSERT INTO corporate_request_attachments(corporate_request_id,original_name,stored_name,mime_type,file_size) VALUES($1,$2,$3,$4,$5)`,[result.rows[0].id,file.originalname,file.filename,file.mimetype,file.size]);if(approver?.id)await client.query(`INSERT INTO notifications(user_id,title,message,notification_type,resource_type,resource_id) VALUES($1,$2,$3,'approval','corporate_request',$4)`,[approver.id,approvalTitle,`${result.rows[0].reference_no} is waiting for your approval.`,result.rows[0].id]);await client.query('COMMIT');res.status(201).json(result.rows[0])}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}))

app.post('/api/announcements/:id/attachments',auth,permit('Announcements'),attachmentUpload.array('files',5),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const files=(req.files as Express.Multer.File[])??[];const inserted=[];for(const file of files){const result=await db.query(`INSERT INTO announcement_attachments(announcement_id,original_name,stored_name,mime_type,file_size) VALUES($1,$2,$3,$4,$5) RETURNING *`,[req.params.id,file.originalname,file.filename,file.mimetype,file.size]);inserted.push(result.rows[0])}res.status(201).json(inserted)
}))

app.get('/api/announcements/:id/attachments/:attachmentId',auth,permit('Announcements'),asyncRoute(async(req,res)=>{
  const result=await db.query(`SELECT * FROM announcement_attachments WHERE id=$1 AND announcement_id=$2`,[req.params.attachmentId,req.params.id]);if(!result.rowCount)return res.status(404).json({error:'Attachment not found'});const file=result.rows[0];res.download(join(uploadDirectory,file.stored_name),file.original_name)
}))

const learningCourseInput=z.object({courseCode:z.string().trim().max(30).optional().default(''),title:z.string().trim().min(2).max(180),description:z.string().max(4000).optional().default(''),category:z.string().max(100).optional().default(''),deliveryMethod:z.enum(['in_person','online','classroom','training_room']).default('in_person'),assignmentMode:z.enum(['exact','progressive','custom']).default('progressive'),isMandatory:z.boolean().default(true),durationMinutes:z.coerce.number().int().min(0).default(0),status:z.enum(['draft','active','inactive','archived']).default('draft'),certificateTitle:z.string().trim().min(2).max(180).default('Certificate of Completion'),audienceTypes:z.array(z.enum(['all_employees','specific_employees','rank'])).min(1).default(['all_employees']),employeeIds:z.array(z.string().uuid()).default([]),rankIds:z.array(z.string().uuid()).default([])}).refine(value=>!value.audienceTypes.includes('specific_employees')||value.employeeIds.length>0,{message:'Select at least one employee',path:['employeeIds']}).refine(value=>!value.audienceTypes.includes('rank')||value.rankIds.length>0,{message:'Select at least one rank',path:['rankIds']})
const nextLearningCourseCode=async(query:{query:(text:string,values?:unknown[])=>Promise<{rows:Record<string,unknown>[]}>},companyId:string)=>{
  await query.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`learning-course-code:${companyId}`])
  const next=(await query.query(`SELECT COALESCE(MAX(CASE WHEN course_code~'^LDR-[0-9]+$' THEN substring(course_code from '[0-9]+$')::int END),0)+1 next_number FROM learning_courses WHERE company_id=$1`,[companyId])).rows[0]
  return `LDR-${String(next.next_number).padStart(3,'0')}`
}
const learningModuleInput=z.object({title:z.string().trim().min(2).max(180),description:z.string().max(4000).optional().default(''),sequenceNo:z.coerce.number().int().positive(),audienceType:z.enum(['all','job_levels']).default('all'),targetLevelIds:z.array(z.string().uuid()).default([]),isMandatory:z.boolean().default(true),durationMinutes:z.coerce.number().int().min(0).default(0),credit:z.coerce.number().min(0).max(10000).default(0),passingScore:z.union([z.coerce.number().min(0).max(100),z.null()]).optional().default(null),maxAttempts:z.coerce.number().int().positive().default(3)}).refine(value=>value.audienceType==='all'||value.targetLevelIds.length>0,{message:'Select at least one target job level',path:['targetLevelIds']})

app.get('/api/learning/job-levels',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  const result=await db.query(`SELECT jl.id,jl.level_key,jl.level_name,jl.level_rank,jl.is_active FROM learning_job_levels jl JOIN employees e ON e.company_id=jl.company_id WHERE e.id=$1 AND jl.is_active=true ORDER BY jl.level_rank`,[req.user!.employeeId]);res.json(result.rows)
}))

app.get('/api/learning/employees',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const result=await db.query(`SELECT employee.id,employee.employee_no,trim(employee.first_name||' '||employee.last_name) employee_name,COALESCE(NULLIF(employee.business_email,''),employee.email) email,employee.position,jl.level_name FROM employees employee JOIN employees viewer ON viewer.company_id=employee.company_id LEFT JOIN learning_job_levels jl ON jl.id=employee.job_level_id WHERE viewer.id=$1 AND employee.employment_status='active' ORDER BY employee.first_name,employee.last_name`,[req.user!.employeeId]);res.json(result.rows)
}))

app.get('/api/learning/courses',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  const result=await db.query(`SELECT c.*,COALESCE((SELECT json_agg(cat.audience_type ORDER BY cat.audience_type) FROM learning_course_audience_types cat WHERE cat.course_id=c.id),'[]'::json) audience_types,COALESCE((SELECT json_agg(cet.employee_id) FROM learning_course_employee_targets cet WHERE cet.course_id=c.id),'[]'::json) employee_ids,COALESCE((SELECT json_agg(crt.job_level_id) FROM learning_course_rank_targets crt WHERE crt.course_id=c.id),'[]'::json) rank_ids,COALESCE(json_agg(json_build_object('id',m.id,'module_code',m.module_code,'title',m.title,'description',m.description,'sequence_no',m.sequence_no,'audience_type',m.audience_type,'is_mandatory',m.is_mandatory,'duration_minutes',m.duration_minutes,'passing_score',m.passing_score,'max_attempts',m.max_attempts,'target_levels',COALESCE((SELECT json_agg(json_build_object('id',jl.id,'level_name',jl.level_name,'level_rank',jl.level_rank) ORDER BY jl.level_rank) FROM learning_module_target_levels mt JOIN learning_job_levels jl ON jl.id=mt.job_level_id WHERE mt.module_id=m.id),'[]'::json),'contents',COALESCE((SELECT json_agg(json_build_object('id',lc.id,'content_type',lc.content_type,'title',lc.title,'description',lc.description,'youtube_url',lc.youtube_url,'youtube_video_id',lc.youtube_video_id,'original_name',lc.original_name,'mime_type',lc.mime_type,'file_size',lc.file_size,'content_body',lc.content_body,'sequence_no',lc.sequence_no,'completed',EXISTS(SELECT 1 FROM learning_content_progress cp WHERE cp.content_id=lc.id AND cp.employee_id=$1)) ORDER BY lc.sequence_no,lc.created_at) FROM learning_module_contents lc WHERE lc.module_id=m.id),'[]'::json)) ORDER BY m.sequence_no) FILTER(WHERE m.id IS NOT NULL),'[]'::json) modules FROM learning_courses c JOIN employees e ON e.company_id=c.company_id LEFT JOIN learning_modules m ON m.course_id=c.id WHERE e.id=$1 AND c.status<>'archived' AND (EXISTS(SELECT 1 FROM users viewer_user WHERE viewer_user.employee_id=e.id AND viewer_user.role IN ('admin','hr')) OR (c.status='active' AND (EXISTS(SELECT 1 FROM learning_course_audience_types cat WHERE cat.course_id=c.id AND cat.audience_type='all_employees') OR EXISTS(SELECT 1 FROM learning_course_employee_targets cet WHERE cet.course_id=c.id AND cet.employee_id=e.id) OR EXISTS(SELECT 1 FROM learning_course_rank_targets crt WHERE crt.course_id=c.id AND crt.job_level_id=e.job_level_id)))) GROUP BY c.id ORDER BY c.updated_at DESC`,[req.user!.employeeId]);res.json(result.rows)
}))

app.get('/api/learning/course-catalog-status',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  const result=await db.query(`SELECT c.id course_id,COUNT(DISTINCT lc.id)::int total_contents,COUNT(DISTINCT cp.content_id)::int completed_contents,EXISTS(SELECT 1 FROM learning_certificates cert WHERE cert.course_id=c.id AND cert.employee_id=e.id AND cert.status='valid') completed FROM learning_courses c JOIN employees e ON e.company_id=c.company_id LEFT JOIN learning_modules m ON m.course_id=c.id LEFT JOIN learning_module_contents lc ON lc.module_id=m.id LEFT JOIN learning_content_progress cp ON cp.content_id=lc.id AND cp.employee_id=e.id WHERE e.id=$1 AND c.status<>'archived' AND (EXISTS(SELECT 1 FROM users viewer_user WHERE viewer_user.employee_id=e.id AND viewer_user.role IN ('admin','hr')) OR (c.status='active' AND (EXISTS(SELECT 1 FROM learning_course_audience_types cat WHERE cat.course_id=c.id AND cat.audience_type='all_employees') OR EXISTS(SELECT 1 FROM learning_course_employee_targets cet WHERE cet.course_id=c.id AND cet.employee_id=e.id) OR EXISTS(SELECT 1 FROM learning_course_rank_targets crt WHERE crt.course_id=c.id AND crt.job_level_id=e.job_level_id)))) GROUP BY c.id,e.id ORDER BY c.updated_at DESC`,[req.user!.employeeId]);res.json(result.rows.map(row=>({...row,percentage:Number(row.total_contents)?Math.round(Number(row.completed_contents)/Number(row.total_contents)*100):0})))
}))

app.get('/api/learning/course-credits',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  const result=await db.query(`SELECT c.id course_id,m.id module_id,m.credit FROM learning_courses c JOIN employees e ON e.company_id=c.company_id LEFT JOIN learning_modules m ON m.course_id=c.id WHERE e.id=$1 AND c.status<>'archived' AND (c.status='active' OR EXISTS(SELECT 1 FROM users viewer_user WHERE viewer_user.employee_id=e.id AND viewer_user.role IN ('admin','hr')))`,[req.user!.employeeId]);res.json(result.rows)
}))

app.post('/api/learning/courses',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const input=learningCourseInput.parse(req.body);const company=(await db.query('SELECT company_id FROM employees WHERE id=$1',[req.user!.employeeId])).rows[0];const client=await db.connect();try{await client.query('BEGIN');const courseCode=await nextLearningCourseCode(client,String(company.company_id));const result=await client.query(`INSERT INTO learning_courses(company_id,course_code,title,description,category,delivery_method,assignment_mode,is_mandatory,duration_minutes,status,certificate_title,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[company.company_id,courseCode,input.title,input.description||null,input.category||null,input.deliveryMethod,input.assignmentMode,input.isMandatory,input.durationMinutes,input.status,input.certificateTitle,req.user!.id]);for(const type of input.audienceTypes)await client.query(`INSERT INTO learning_course_audience_types(course_id,audience_type) VALUES($1,$2)`,[result.rows[0].id,type]);if(input.audienceTypes.includes('specific_employees'))for(const employeeId of input.employeeIds)await client.query(`INSERT INTO learning_course_employee_targets(course_id,employee_id) SELECT $1,e.id FROM employees e WHERE e.id=$2 AND e.company_id=$3`,[result.rows[0].id,employeeId,company.company_id]);if(input.audienceTypes.includes('rank'))for(const rankId of input.rankIds)await client.query(`INSERT INTO learning_course_rank_targets(course_id,job_level_id) SELECT $1,jl.id FROM learning_job_levels jl WHERE jl.id=$2 AND jl.company_id=$3`,[result.rows[0].id,rankId,company.company_id]);await client.query('COMMIT');res.status(201).json(result.rows[0])}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}))

app.post('/api/learning/courses/:id/certificate-template',auth,permit('Learning Management'),certificateTemplateUpload.single('template'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role)){if(req.file)unlinkSync(req.file.path);return res.status(403).json({error:'HR or admin access required'})}if(!req.file)return res.status(400).json({error:'Select a PDF, PNG or JPG certificate template'});const title=z.string().trim().min(2).max(180).parse(req.body.certificateTitle??'Certificate of Completion');const previous=(await db.query(`SELECT c.certificate_template_stored_name FROM learning_courses c JOIN employees e ON e.company_id=c.company_id WHERE c.id=$1 AND e.id=$2`,[req.params.id,req.user!.employeeId])).rows[0];if(!previous){unlinkSync(req.file.path);return res.status(404).json({error:'Course not found'})}await db.query(`UPDATE learning_courses SET certificate_title=$1,certificate_template_type='custom',certificate_template_original_name=$2,certificate_template_stored_name=$3,certificate_template_mime_type=$4,updated_at=now() WHERE id=$5`,[title,req.file.originalname,req.file.filename,req.file.mimetype,req.params.id]);if(previous.certificate_template_stored_name)try{unlinkSync(join(uploadDirectory,previous.certificate_template_stored_name))}catch{}res.status(201).json({message:'Certificate template uploaded',originalName:req.file.originalname})
}))

app.patch('/api/learning/courses/:id',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const input=learningCourseInput.parse(req.body);const client=await db.connect();try{await client.query('BEGIN');const company=(await client.query(`SELECT c.company_id FROM learning_courses c JOIN employees e ON e.company_id=c.company_id WHERE c.id=$1 AND e.id=$2`,[req.params.id,req.user!.employeeId])).rows[0];if(!company){await client.query('ROLLBACK');return res.status(404).json({error:'Course not found'})}const result=await client.query(`UPDATE learning_courses SET title=$1,description=$2,category=$3,delivery_method=$4,assignment_mode=$5,is_mandatory=$6,duration_minutes=$7,status=$8,certificate_title=$9,updated_at=now() WHERE id=$10 RETURNING *`,[input.title,input.description||null,input.category||null,input.deliveryMethod,input.assignmentMode,input.isMandatory,input.durationMinutes,input.status,input.certificateTitle,req.params.id]);await client.query(`DELETE FROM learning_course_audience_types WHERE course_id=$1`,[req.params.id]);await client.query(`DELETE FROM learning_course_employee_targets WHERE course_id=$1`,[req.params.id]);await client.query(`DELETE FROM learning_course_rank_targets WHERE course_id=$1`,[req.params.id]);for(const type of input.audienceTypes)await client.query(`INSERT INTO learning_course_audience_types(course_id,audience_type) VALUES($1,$2)`,[req.params.id,type]);if(input.audienceTypes.includes('specific_employees'))for(const employeeId of input.employeeIds)await client.query(`INSERT INTO learning_course_employee_targets(course_id,employee_id) SELECT $1,e.id FROM employees e WHERE e.id=$2 AND e.company_id=$3`,[req.params.id,employeeId,company.company_id]);if(input.audienceTypes.includes('rank'))for(const rankId of input.rankIds)await client.query(`INSERT INTO learning_course_rank_targets(course_id,job_level_id) SELECT $1,jl.id FROM learning_job_levels jl WHERE jl.id=$2 AND jl.company_id=$3`,[req.params.id,rankId,company.company_id]);await client.query('COMMIT');res.json(result.rows[0])}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}))

app.delete('/api/learning/courses/:id',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const result=await db.query(`UPDATE learning_courses c SET status='archived',updated_at=now() FROM employees e WHERE c.id=$1 AND e.id=$2 AND e.company_id=c.company_id AND c.status<>'archived' RETURNING c.id`,[req.params.id,req.user!.employeeId]);if(!result.rowCount)return res.status(404).json({error:'Course not found'});res.json({message:'Course removed'})
}))

app.post('/api/learning/courses/:id/modules',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const input=learningModuleInput.parse(req.body),moduleCode=`MODULE-${input.sequenceNo}`;const client=await db.connect();try{await client.query('BEGIN');const allowed=(await client.query(`SELECT c.id FROM learning_courses c JOIN employees e ON e.company_id=c.company_id WHERE c.id=$1 AND e.id=$2`,[req.params.id,req.user!.employeeId])).rows[0];if(!allowed){await client.query('ROLLBACK');return res.status(404).json({error:'Course not found'})}const result=await client.query(`INSERT INTO learning_modules(course_id,module_code,title,description,sequence_no,audience_type,is_mandatory,duration_minutes,credit,passing_score,max_attempts) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[req.params.id,moduleCode,input.title,input.description||null,input.sequenceNo,input.audienceType,input.isMandatory,input.durationMinutes,input.credit,input.passingScore,input.maxAttempts]);if(input.audienceType==='job_levels')for(const levelId of input.targetLevelIds)await client.query(`INSERT INTO learning_module_target_levels(module_id,job_level_id) SELECT $1,jl.id FROM learning_job_levels jl JOIN learning_courses c ON c.company_id=jl.company_id WHERE jl.id=$2 AND c.id=$3`,[result.rows[0].id,levelId,req.params.id]);await client.query('COMMIT');res.status(201).json(result.rows[0])}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}))

app.patch('/api/learning/modules/:id',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const input=learningModuleInput.parse(req.body);const result=await db.query(`UPDATE learning_modules m SET title=$1,description=$2,sequence_no=$3,audience_type='all',is_mandatory=$4,duration_minutes=$5,passing_score=$6,max_attempts=$7,updated_at=now() FROM learning_courses c,employees e WHERE m.id=$8 AND c.id=m.course_id AND e.id=$9 AND e.company_id=c.company_id RETURNING m.*`,[input.title,input.description||null,input.sequenceNo,input.isMandatory,input.durationMinutes,input.passingScore,input.maxAttempts,req.params.id,req.user!.employeeId]);if(!result.rowCount)return res.status(404).json({error:'Module not found'});res.json(result.rows[0])
}))

app.delete('/api/learning/modules/:id',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const result=await db.query(`DELETE FROM learning_modules m USING learning_courses c,employees e WHERE m.id=$1 AND c.id=m.course_id AND e.id=$2 AND e.company_id=c.company_id RETURNING m.id`,[req.params.id,req.user!.employeeId]);if(!result.rowCount)return res.status(404).json({error:'Module not found'});res.json({message:'Module removed'})
}))

const youtubeVideoId=(raw:string)=>{try{const url=new URL(raw);const host=url.hostname.toLowerCase().replace(/^www\./,'');if(host==='youtu.be')return url.pathname.split('/').filter(Boolean)[0]??'';if(host==='youtube.com'||host==='m.youtube.com'){if(url.pathname==='/watch')return url.searchParams.get('v')??'';const match=url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/);return match?.[1]??''}return ''}catch{return ''}}

app.post('/api/learning/modules/:id/youtube',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const input=z.object({title:z.string().trim().min(2).max(180),description:z.string().max(100000).optional().default(''),youtubeUrl:z.string().url().max(1000),sequenceNo:z.coerce.number().int().positive().default(1)}).parse(req.body);const videoId=youtubeVideoId(input.youtubeUrl);if(!/^[a-zA-Z0-9_-]{6,20}$/.test(videoId))return res.status(400).json({error:'Please enter a valid YouTube video URL'});const result=await db.query(`INSERT INTO learning_module_contents(module_id,content_type,title,description,youtube_url,youtube_video_id,sequence_no,created_by) SELECT m.id,'youtube',$1,$2,$3,$4,$5,$6 FROM learning_modules m JOIN learning_courses c ON c.id=m.course_id JOIN employees e ON e.company_id=c.company_id WHERE m.id=$7 AND e.id=$8 RETURNING *`,[input.title,input.description||null,input.youtubeUrl,videoId,input.sequenceNo,req.user!.id,req.params.id,req.user!.employeeId]);if(!result.rowCount)return res.status(404).json({error:'Module not found'});res.status(201).json(result.rows[0])
}))

app.post('/api/learning/modules/:id/files',auth,permit('Learning Management'),learningContentUpload.single('file'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role)){if(req.file)unlinkSync(req.file.path);return res.status(403).json({error:'HR or admin access required'})}if(!req.file)return res.status(400).json({error:'Please select a supported learning file'});const input=z.object({title:z.string().trim().min(2).max(180),description:z.string().max(100000).optional().default(''),sequenceNo:z.coerce.number().int().positive().default(1)}).parse(req.body);const result=await db.query(`INSERT INTO learning_module_contents(module_id,content_type,title,description,original_name,stored_name,mime_type,file_size,sequence_no,created_by) SELECT m.id,'file',$1,$2,$3,$4,$5,$6,$7,$8 FROM learning_modules m JOIN learning_courses c ON c.id=m.course_id JOIN employees e ON e.company_id=c.company_id WHERE m.id=$9 AND e.id=$10 RETURNING *`,[input.title,input.description||null,req.file.originalname,req.file.filename,req.file.mimetype,req.file.size,input.sequenceNo,req.user!.id,req.params.id,req.user!.employeeId]);if(!result.rowCount){unlinkSync(req.file.path);return res.status(404).json({error:'Module not found'})}res.status(201).json(result.rows[0])
}))

app.post('/api/learning/modules/:id/documents',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const input=z.object({title:z.string().trim().min(2).max(180),contentBody:z.string().trim().min(10).max(100000),sequenceNo:z.coerce.number().int().positive().default(1)}).parse(req.body);const result=await db.query(`INSERT INTO learning_module_contents(module_id,content_type,title,content_body,sequence_no,created_by) SELECT m.id,'document',$1,$2,$3,$4 FROM learning_modules m JOIN learning_courses c ON c.id=m.course_id JOIN employees e ON e.company_id=c.company_id WHERE m.id=$5 AND e.id=$6 RETURNING *`,[input.title,input.contentBody,input.sequenceNo,req.user!.id,req.params.id,req.user!.employeeId]);if(!result.rowCount)return res.status(404).json({error:'Module not found'});res.status(201).json(result.rows[0])
}))

app.patch('/api/learning/contents/:id',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const input=z.object({title:z.string().trim().min(2).max(180),description:z.string().max(100000).optional().default(''),youtubeUrl:z.string().url().max(1000).optional(),contentBody:z.string().trim().min(10).max(100000).optional(),sequenceNo:z.coerce.number().int().positive()}).parse(req.body);const current=(await db.query(`SELECT lc.content_type FROM learning_module_contents lc JOIN learning_modules m ON m.id=lc.module_id JOIN learning_courses c ON c.id=m.course_id JOIN employees e ON e.company_id=c.company_id WHERE lc.id=$1 AND e.id=$2`,[req.params.id,req.user!.employeeId])).rows[0];if(!current)return res.status(404).json({error:'Content not found'});if(current.content_type==='file')return res.status(400).json({error:'Use the file content update endpoint'});let videoId:null|string=null;if(current.content_type==='youtube'){if(!input.youtubeUrl)return res.status(400).json({error:'YouTube URL is required'});videoId=youtubeVideoId(input.youtubeUrl);if(!/^[a-zA-Z0-9_-]{6,20}$/.test(videoId))return res.status(400).json({error:'Please enter a valid YouTube video URL'})}if(current.content_type==='document'&&!input.contentBody)return res.status(400).json({error:'Lesson document is required'});const result=await db.query(`UPDATE learning_module_contents SET title=$1,description=$2,youtube_url=CASE WHEN content_type='youtube' THEN $3 ELSE youtube_url END,youtube_video_id=CASE WHEN content_type='youtube' THEN $4 ELSE youtube_video_id END,content_body=CASE WHEN content_type='document' THEN $5 ELSE content_body END,sequence_no=$6,updated_at=now() WHERE id=$7 RETURNING *`,[input.title,input.description||null,input.youtubeUrl??null,videoId,input.contentBody??null,input.sequenceNo,req.params.id]);res.json(result.rows[0])
}))

app.patch('/api/learning/contents/:id/file',auth,permit('Learning Management'),learningContentUpload.single('file'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role)){if(req.file)unlinkSync(req.file.path);return res.status(403).json({error:'HR or admin access required'})}const input=z.object({title:z.string().trim().min(2).max(180),description:z.string().max(100000).optional().default(''),sequenceNo:z.coerce.number().int().positive()}).parse(req.body);const previous=(await db.query(`SELECT lc.stored_name FROM learning_module_contents lc JOIN learning_modules m ON m.id=lc.module_id JOIN learning_courses c ON c.id=m.course_id JOIN employees e ON e.company_id=c.company_id WHERE lc.id=$1 AND e.id=$2 AND lc.content_type='file'`,[req.params.id,req.user!.employeeId])).rows[0];if(!previous){if(req.file)unlinkSync(req.file.path);return res.status(404).json({error:'File content not found'})}const result=await db.query(`UPDATE learning_module_contents SET title=$1,description=$2,sequence_no=$3,original_name=COALESCE($4,original_name),stored_name=COALESCE($5,stored_name),mime_type=COALESCE($6,mime_type),file_size=COALESCE($7,file_size),updated_at=now() WHERE id=$8 RETURNING *`,[input.title,input.description||null,input.sequenceNo,req.file?.originalname??null,req.file?.filename??null,req.file?.mimetype??null,req.file?.size??null,req.params.id]);if(req.file&&previous.stored_name)try{unlinkSync(join(uploadDirectory,previous.stored_name))}catch{}res.json(result.rows[0])
}))

app.get('/api/learning/contents/:id/file',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  const result=await db.query(`SELECT lc.* FROM learning_module_contents lc JOIN learning_modules m ON m.id=lc.module_id JOIN learning_courses c ON c.id=m.course_id JOIN employees e ON e.company_id=c.company_id WHERE lc.id=$1 AND e.id=$2 AND lc.content_type='file'`,[req.params.id,req.user!.employeeId]);if(!result.rowCount)return res.status(404).json({error:'Learning content not found'});const file=result.rows[0];res.type(file.mime_type||'application/octet-stream');res.setHeader('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);res.sendFile(join(uploadDirectory,file.stored_name))
}))

app.delete('/api/learning/contents/:id',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const result=await db.query(`DELETE FROM learning_module_contents lc USING learning_modules m,learning_courses c,employees e WHERE lc.id=$1 AND m.id=lc.module_id AND c.id=m.course_id AND e.id=$2 AND e.company_id=c.company_id RETURNING lc.stored_name`,[req.params.id,req.user!.employeeId]);if(!result.rowCount)return res.status(404).json({error:'Content not found'});if(result.rows[0].stored_name)try{unlinkSync(join(uploadDirectory,result.rows[0].stored_name))}catch{}res.json({message:'Content removed'})
}))

app.post('/api/learning/contents/:id/complete',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  const access=await db.query(`SELECT lc.id FROM learning_module_contents lc JOIN learning_modules m ON m.id=lc.module_id JOIN learning_courses c ON c.id=m.course_id JOIN employees viewer ON viewer.company_id=c.company_id WHERE lc.id=$1 AND viewer.id=$2`,[req.params.id,req.user!.employeeId]);if(!access.rowCount)return res.status(404).json({error:'Learning content not found'});await db.query(`INSERT INTO learning_content_progress(employee_id,content_id) VALUES($1,$2) ON CONFLICT(employee_id,content_id) DO UPDATE SET completed_at=now()`,[req.user!.employeeId,req.params.id]);res.json({completed:true})
}))

app.post('/api/learning/modules/:id/complete',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  const contents=await db.query(`SELECT lc.id FROM learning_module_contents lc JOIN learning_modules m ON m.id=lc.module_id JOIN learning_courses c ON c.id=m.course_id JOIN employees viewer ON viewer.company_id=c.company_id WHERE m.id=$1 AND viewer.id=$2`,[req.params.id,req.user!.employeeId]);if(!contents.rowCount)return res.status(400).json({error:'Add at least one learning content before completing this module'});for(const content of contents.rows)await db.query(`INSERT INTO learning_content_progress(employee_id,content_id) VALUES($1,$2) ON CONFLICT(employee_id,content_id) DO UPDATE SET completed_at=now()`,[req.user!.employeeId,content.id]);res.json({completed:true,completedContents:contents.rowCount})
}))

app.get('/api/learning/courses/:id/progress',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  const course=(await db.query(`SELECT c.id,c.title FROM learning_courses c JOIN employees e ON e.company_id=c.company_id WHERE c.id=$1 AND e.id=$2`,[req.params.id,req.user!.employeeId])).rows[0];if(!course)return res.status(404).json({error:'Course not found'});const modules=(await db.query(`SELECT m.id,m.title,m.sequence_no,m.is_mandatory,COUNT(lc.id)::int content_count,COUNT(cp.content_id)::int completed_count FROM learning_modules m LEFT JOIN learning_module_contents lc ON lc.module_id=m.id LEFT JOIN learning_content_progress cp ON cp.content_id=lc.id AND cp.employee_id=$2 WHERE m.course_id=$1 GROUP BY m.id ORDER BY m.sequence_no`,[req.params.id,req.user!.employeeId])).rows;const assessmentUnlocked=modules.length>0&&modules.every(row=>Number(row.content_count)>0&&Number(row.completed_count)>=Number(row.content_count));const attempts=(await db.query(`SELECT id,attempt_no,score,passed,submitted_at FROM learning_assessment_attempts WHERE course_id=$1 AND employee_id=$2 ORDER BY attempt_no DESC`,[req.params.id,req.user!.employeeId])).rows;const certificate=(await db.query(`SELECT id,certificate_no,score,issued_at,status FROM learning_certificates WHERE course_id=$1 AND employee_id=$2`,[req.params.id,req.user!.employeeId])).rows[0]??null;const total=modules.reduce((sum,row)=>sum+Number(row.content_count),0),completed=modules.reduce((sum,row)=>sum+Number(row.completed_count),0);res.json({course,modules,totalContents:total,completedContents:completed,percentage:total?Math.round(completed/total*100):0,assessmentUnlocked,passingScore:70,maxAttempts:3,attempts,certificate})
}))

app.post('/api/learning/courses/:id/questions',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const input=z.object({questionText:z.string().trim().min(3).max(2000),questionType:z.enum(['single_choice','multiple_choice','true_false']).default('single_choice'),options:z.array(z.string().trim().min(1).max(500)).min(2).max(10),correctAnswers:z.array(z.string().trim().min(1).max(500)).min(1),points:z.coerce.number().positive().max(100).default(1)}).parse(req.body);if(input.correctAnswers.some(answer=>!input.options.includes(answer)))return res.status(400).json({error:'Correct answers must exist in the options'});const result=await db.query(`INSERT INTO learning_assessment_questions(course_id,question_text,question_type,options,correct_answers,points,sequence_no,created_by) SELECT c.id,$1,$2,$3,$4,$5,COALESCE((SELECT MAX(q.sequence_no)+1 FROM learning_assessment_questions q WHERE q.course_id=c.id),1),$6 FROM learning_courses c JOIN employees e ON e.company_id=c.company_id WHERE c.id=$7 AND e.id=$8 RETURNING id,question_text,question_type,options,points,sequence_no`,[input.questionText,input.questionType,JSON.stringify(input.options),JSON.stringify(input.correctAnswers),input.points,req.user!.id,req.params.id,req.user!.employeeId]);if(!result.rowCount)return res.status(404).json({error:'Course not found'});res.status(201).json(result.rows[0])
}))

app.get('/api/learning/courses/:id/questions/manage',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const allowed=(await db.query(`SELECT c.id FROM learning_courses c JOIN employees e ON e.company_id=c.company_id WHERE c.id=$1 AND e.id=$2`,[req.params.id,req.user!.employeeId])).rows[0];if(!allowed)return res.status(404).json({error:'Course not found'});const questions=await db.query(`SELECT id,question_text,question_type,options,correct_answers,points,sequence_no FROM learning_assessment_questions WHERE course_id=$1 ORDER BY sequence_no,created_at`,[req.params.id]);res.json(questions.rows)
}))

app.patch('/api/learning/questions/:id',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const input=z.object({questionText:z.string().trim().min(3).max(2000),questionType:z.enum(['single_choice','multiple_choice','true_false']),options:z.array(z.string().trim().min(1).max(500)).min(2).max(10),correctAnswers:z.array(z.string().trim().min(1).max(500)).min(1),points:z.coerce.number().positive().max(100),sequenceNo:z.coerce.number().int().positive()}).parse(req.body);if(input.correctAnswers.some(answer=>!input.options.includes(answer)))return res.status(400).json({error:'Correct answers must exist in the options'});const result=await db.query(`UPDATE learning_assessment_questions q SET question_text=$1,question_type=$2,options=$3,correct_answers=$4,points=$5,sequence_no=$6 FROM learning_courses c,employees e WHERE q.id=$7 AND c.id=q.course_id AND e.id=$8 AND e.company_id=c.company_id RETURNING q.id,q.question_text,q.question_type,q.options,q.correct_answers,q.points,q.sequence_no`,[input.questionText,input.questionType,JSON.stringify(input.options),JSON.stringify(input.correctAnswers),input.points,input.sequenceNo,req.params.id,req.user!.employeeId]);if(!result.rowCount)return res.status(404).json({error:'Question not found'});res.json(result.rows[0])
}))

app.get('/api/learning/courses/:id/assessment',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  const progress=(await db.query(`SELECT COUNT(m.id)::int total_modules,COUNT(m.id) FILTER(WHERE stats.content_count>0 AND stats.completed_count>=stats.content_count)::int completed_modules FROM learning_modules m LEFT JOIN LATERAL(SELECT COUNT(lc.id)::int content_count,COUNT(cp.content_id)::int completed_count FROM learning_module_contents lc LEFT JOIN learning_content_progress cp ON cp.content_id=lc.id AND cp.employee_id=$2 WHERE lc.module_id=m.id) stats ON true WHERE m.course_id=$1`,[req.params.id,req.user!.employeeId])).rows[0];const unlocked=Number(progress.total_modules)>0&&Number(progress.completed_modules)===Number(progress.total_modules);if(!unlocked)return res.status(403).json({error:'Complete all modules to unlock the assessment'});const attempts=Number((await db.query(`SELECT COUNT(*) count FROM learning_assessment_attempts WHERE course_id=$1 AND employee_id=$2`,[req.params.id,req.user!.employeeId])).rows[0].count);if(attempts>=3)return res.status(403).json({error:'Maximum assessment attempts reached'});const questions=await db.query(`SELECT id,question_text,question_type,options,points,sequence_no FROM learning_assessment_questions WHERE course_id=$1 ORDER BY sequence_no`,[req.params.id]);res.json({questions:questions.rows,attemptNo:attempts+1,passingScore:70,attemptsRemaining:3-attempts})
}))

app.post('/api/learning/courses/:id/assessment/submit',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  const input=z.object({answers:z.record(z.string(),z.array(z.string()))}).parse(req.body);const progress=(await db.query(`SELECT COUNT(m.id)::int total_modules,COUNT(m.id) FILTER(WHERE stats.content_count>0 AND stats.completed_count>=stats.content_count)::int completed_modules FROM learning_modules m LEFT JOIN LATERAL(SELECT COUNT(lc.id)::int content_count,COUNT(cp.content_id)::int completed_count FROM learning_module_contents lc LEFT JOIN learning_content_progress cp ON cp.content_id=lc.id AND cp.employee_id=$2 WHERE lc.module_id=m.id) stats ON true WHERE m.course_id=$1`,[req.params.id,req.user!.employeeId])).rows[0];if(!Number(progress.total_modules)||Number(progress.completed_modules)!==Number(progress.total_modules))return res.status(403).json({error:'Complete all modules first'});const questions=(await db.query(`SELECT id,correct_answers,points FROM learning_assessment_questions WHERE course_id=$1 ORDER BY sequence_no`,[req.params.id])).rows;if(!questions.length)return res.status(400).json({error:'This course does not have assessment questions yet'});const previous=Number((await db.query(`SELECT COUNT(*) count FROM learning_assessment_attempts WHERE course_id=$1 AND employee_id=$2`,[req.params.id,req.user!.employeeId])).rows[0].count);if(previous>=3)return res.status(409).json({error:'Maximum assessment attempts reached'});const normalize=(values:unknown)=>Array.isArray(values)?values.map(String).sort():[];const total=questions.reduce((sum,q)=>sum+Number(q.points),0);const earned=questions.reduce((sum,q)=>JSON.stringify(normalize(input.answers[q.id]))===JSON.stringify(normalize(q.correct_answers))?sum+Number(q.points):sum,0);const score=Math.round(earned/total*10000)/100,passed=score>=70;const client=await db.connect();try{await client.query('BEGIN');const attempt=(await client.query(`INSERT INTO learning_assessment_attempts(course_id,employee_id,attempt_no,answers,score,passed) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[req.params.id,req.user!.employeeId,previous+1,input.answers,score,passed])).rows[0];let certificate=null;if(passed){const certificateNo=`LMS-${new Date().getFullYear()}-${randomUUID().slice(0,8).toUpperCase()}`;certificate=(await client.query(`INSERT INTO learning_certificates(certificate_no,course_id,employee_id,attempt_id,score) VALUES($1,$2,$3,$4,$5) ON CONFLICT(course_id,employee_id) DO UPDATE SET attempt_id=EXCLUDED.attempt_id,score=EXCLUDED.score,status='valid' RETURNING id,certificate_no,score,issued_at,status`,[certificateNo,req.params.id,req.user!.employeeId,attempt.id,score])).rows[0]}await client.query('COMMIT');res.json({attemptNo:previous+1,score,passed,passingScore:70,attemptsRemaining:Math.max(0,2-previous),certificate})}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}))

app.delete('/api/learning/questions/:id',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  if(!['admin','hr'].includes(req.user!.role))return res.status(403).json({error:'HR or admin access required'});const result=await db.query(`DELETE FROM learning_assessment_questions q USING learning_courses c,employees e WHERE q.id=$1 AND c.id=q.course_id AND e.id=$2 AND e.company_id=c.company_id RETURNING q.id`,[req.params.id,req.user!.employeeId]);if(!result.rowCount)return res.status(404).json({error:'Question not found'});res.json({message:'Question removed'})
}))

const pdfSafe=(value:unknown)=>String(value??'').normalize('NFKD').replace(/[^\x20-\x7E]/g,'').replace(/([\\()])/g,'\\$1')
const certificatePdf=(data:{certificateTitle:string;employeeName:string;courseTitle:string;completionDate:string;certificateNo:string;score:string})=>{
  const center=(text:string,size:number)=>Math.max(60,(842-text.length*size*.5)/2);const line=(font:'F1'|'F2',size:number,x:number,y:number,text:string,color='0.027 0.106 0.31')=>`BT /${font} ${size} Tf ${color} rg ${x.toFixed(1)} ${y} Td (${pdfSafe(text)}) Tj ET`
  const content=[`1 1 1 rg 0 0 842 595 re f`,`0.027 0.106 0.31 RG 3 w 18 18 806 559 re S`,`1 0.8 0 RG 1.5 w 26 26 790 543 re S`,`0.027 0.106 0.31 rg 30 500 782 55 re f`,`1 0.8 0 rg 30 493 782 7 re f`,line('F2',13,58,523,'ATOZ GROUP','1 1 1'),line('F1',9,680,523,'LEARNING & DEVELOPMENT','1 1 1'),line('F2',30,center(data.certificateTitle,30),435,data.certificateTitle),line('F1',12,center('This certificate is proudly presented to',12),390,'This certificate is proudly presented to','0.35 0.4 0.48'),line('F2',27,center(data.employeeName,27),342,data.employeeName),`1 0.8 0 RG 2 w 235 326 m 607 326 l S`,line('F1',12,center('for successfully completing the course',12),292,'for successfully completing the course','0.35 0.4 0.48'),line('F2',20,center(data.courseTitle,20),250,data.courseTitle),line('F1',10,130,174,'COMPLETION DATE','0.35 0.4 0.48'),line('F2',13,130,151,data.completionDate),line('F1',10,350,174,'CERTIFICATE ID','0.35 0.4 0.48'),line('F2',13,350,151,data.certificateNo),line('F1',10,650,174,'FINAL SCORE','0.35 0.4 0.48'),line('F2',13,650,151,`${data.score}%`),`0.65 0.7 0.76 RG 1 w 585 92 m 760 92 l S`,line('F1',9,625,76,'AUTHORIZED SIGNATURE','0.35 0.4 0.48'),line('F1',8,52,48,'Verified digital certificate - Company Portal Learning Management','0.45 0.5 0.57')].join('\n')
  const objects=[`<< /Type /Catalog /Pages 2 0 R >>`,`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,`<< /Length ${Buffer.byteLength(content,'latin1')} >>\nstream\n${content}\nendstream`,`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`];let pdf='%PDF-1.4\n%CERT\n';const offsets=[0];objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(pdf,'latin1'));pdf+=`${index+1} 0 obj\n${object}\nendobj\n`});const xref=Buffer.byteLength(pdf,'latin1');pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let index=1;index<=objects.length;index++)pdf+=`${String(offsets[index]).padStart(10,'0')} 00000 n \n`;pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(pdf,'latin1')
}

app.get('/api/learning/certificates/:id/download',auth,permit('Learning Management'),asyncRoute(async(req,res)=>{
  const result=await db.query(`SELECT cert.id,cert.certificate_no,cert.score,cert.issued_at,cert.employee_id,c.title course_title,c.certificate_title,c.certificate_template_type,c.certificate_template_stored_name,trim(owner.first_name||' '||owner.last_name) employee_name,viewer.company_id viewer_company,owner.company_id owner_company FROM learning_certificates cert JOIN learning_courses c ON c.id=cert.course_id JOIN employees owner ON owner.id=cert.employee_id JOIN employees viewer ON viewer.id=$2 WHERE cert.id=$1 AND cert.status='valid'`,[req.params.id,req.user!.employeeId]);const certificate=result.rows[0];if(!certificate||certificate.viewer_company!==certificate.owner_company||(certificate.employee_id!==req.user!.employeeId&&!['admin','hr'].includes(req.user!.role)))return res.status(404).json({error:'Certificate not found'});const completionDate=new Date(certificate.issued_at).toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});if(certificate.certificate_template_type==='custom'&&certificate.certificate_template_stored_name){const outputPath=join(uploadDirectory,`${randomUUID()}.pdf`),scriptPath=join(process.cwd(),'scripts','generate_certificate_pdf.py'),templatePath=join(uploadDirectory,certificate.certificate_template_stored_name);await execFileAsync(certificatePython,[scriptPath,templatePath,outputPath,certificate.certificate_title,certificate.employee_name,certificate.course_title,completionDate,certificate.certificate_no,String(certificate.score)]);res.type('application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${pdfSafe(certificate.certificate_no)}.pdf"`);return res.sendFile(outputPath,()=>{try{unlinkSync(outputPath)}catch{}})}const pdf=certificatePdf({certificateTitle:certificate.certificate_title,employeeName:certificate.employee_name,courseTitle:certificate.course_title,completionDate,certificateNo:certificate.certificate_no,score:String(certificate.score)});res.type('application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${pdfSafe(certificate.certificate_no)}.pdf"`);res.send(pdf)
}))

app.use((error: unknown,req: Request,res: Response,_next: NextFunction) => {
  if(error instanceof multer.MulterError)return res.status(error.code==='LIMIT_FILE_SIZE'?413:400).json({error:error.code==='LIMIT_FILE_SIZE'?'Uploaded file is too large. Maximum learning-content file size is 100 MB.':'Unable to process the uploaded file.'})
  if(error instanceof z.ZodError)return res.status(400).json({error:'Invalid request',details:error.issues})
  console.error(`[API ERROR] ${req.method} ${req.originalUrl}`,error); res.status(500).json({error:'Internal server error'})
})

const port=Number(process.env.PORT ?? 4000)
app.listen(port,()=>console.log(`Company Portal API running at http://localhost:${port}`))
