INSERT INTO role_permissions(company_id, role, menu_key, allowed)
SELECT ur.company_id, ur.role_key, 'L&D Chart Report',
       CASE WHEN ur.role_key = 'admin' THEN true ELSE COALESCE(detail.allowed, reports.allowed, hr.allowed, false) END
FROM user_roles ur
LEFT JOIN role_permissions detail ON detail.company_id = ur.company_id AND detail.role = ur.role_key AND detail.menu_key = 'L&D Detail Report'
LEFT JOIN role_permissions reports ON reports.company_id = ur.company_id AND reports.role = ur.role_key AND reports.menu_key = 'Reports'
LEFT JOIN role_permissions hr ON hr.company_id = ur.company_id AND hr.role = ur.role_key AND hr.menu_key = 'HR Management'
ON CONFLICT(company_id, role, menu_key) DO NOTHING;
