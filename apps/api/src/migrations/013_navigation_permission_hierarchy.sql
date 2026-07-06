WITH mappings(child_key,parent_key) AS (
  VALUES
    ('Leave Approval','Approvals'),('Overtime Approval','Approvals'),('Request Check In/Out Approval','Approvals'),
    ('Request Late In/Out Approval','Approvals'),('Travelling Request Approval','Approvals'),
    ('Payment Request Approval','Approvals'),('Advance Clearance Request Approval','Approvals'),
    ('Material Request Approval','Approvals'),('Service Request Approval','Approvals'),
    ('Stationary Request Approval','Approvals'),('Vehicle Request Approval','Approvals'),
    ('Human Resource','Employees'),('Payment Request Form','Payment Request'),
    ('Advance Clearance Request Form','Advance Clearance'),('Material Request Form','Corporate'),
    ('Service Request Form','Corporate'),('Stationary Request Form','Corporate'),('Vehicle Request Form','Corporate'),
    ('Vehicle Management','Fleet Management'),('HR Management','Reports'),('Asset Management','Reports'),
    ('Corporate Services','Reports'),('Attendance Report','Reports'),('Leave Report','Reports'),
    ('Overtime Report','Reports'),('Appraisals Report','Reports'),('Travelling Request Report','Reports'),
    ('Admin Asset Report','Reports'),('IT Asset Report','Reports'),('Payment Request Report','Reports'),
    ('Advance Clearance Report','Reports'),('Service Request Report','Reports'),('Material Request Report','Reports'),
    ('Stationary Request Report','Reports'),('Vehicle Request Report','Reports'),
    ('Role Access Control','Permission'),('My Requests','Overview'),('General Setting','Settings')
), roles(role) AS (VALUES ('admin'),('hr'),('manager'),('approver'),('employee')),
companies AS (SELECT DISTINCT company_id FROM employees)
INSERT INTO role_permissions(company_id,role,menu_key,allowed)
SELECT c.company_id,r.role,m.child_key,
       CASE WHEN r.role='admin' THEN true ELSE COALESCE(p.allowed,false) END
FROM companies c CROSS JOIN roles r CROSS JOIN mappings m
LEFT JOIN role_permissions p ON p.company_id=c.company_id AND p.role=r.role AND p.menu_key=m.parent_key
ON CONFLICT(company_id,role,menu_key) DO NOTHING;

-- Keep all current top-level containers available whenever at least one child is allowed.
WITH parents(parent_key,child_key) AS (
  VALUES ('Human Resource','Employees'),('Corporate','Payment Request Form'),
         ('Users & Roles','Role Access Control'),('General Setting','Settings')
)
INSERT INTO role_permissions(company_id,role,menu_key,allowed)
SELECT rp.company_id,rp.role,p.parent_key,bool_or(rp.allowed)
FROM role_permissions rp JOIN parents p ON p.child_key=rp.menu_key
GROUP BY rp.company_id,rp.role,p.parent_key
ON CONFLICT(company_id,role,menu_key) DO NOTHING;
