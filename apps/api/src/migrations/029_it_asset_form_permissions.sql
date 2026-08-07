INSERT INTO role_permissions(company_id, role, menu_key, allowed)
SELECT ur.company_id,
       ur.role_key,
       form.menu_key,
       CASE
         WHEN ur.role_key = 'admin' THEN true
         ELSE COALESCE(asset_access.allowed, information_technology_access.allowed, false)
       END
FROM user_roles ur
CROSS JOIN (VALUES
  ('IT Asset Transfer Form'),
  ('IT Asset Write Out Form')
) AS form(menu_key)
LEFT JOIN role_permissions asset_access
  ON asset_access.company_id = ur.company_id
 AND asset_access.role = ur.role_key
 AND asset_access.menu_key = 'IT Asset Management'
LEFT JOIN role_permissions information_technology_access
  ON information_technology_access.company_id = ur.company_id
 AND information_technology_access.role = ur.role_key
 AND information_technology_access.menu_key = 'Information Technology'
ON CONFLICT(company_id, role, menu_key) DO NOTHING;
