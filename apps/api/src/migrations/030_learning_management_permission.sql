INSERT INTO role_permissions(company_id, role, menu_key, allowed)
SELECT ur.company_id,
       ur.role_key,
       'Learning Management',
       CASE
         WHEN ur.role_key = 'admin' THEN true
         ELSE COALESCE(human_resource_access.allowed, false)
       END
FROM user_roles ur
LEFT JOIN role_permissions human_resource_access
  ON human_resource_access.company_id = ur.company_id
 AND human_resource_access.role = ur.role_key
 AND human_resource_access.menu_key = 'Human Resource'
ON CONFLICT(company_id, role, menu_key) DO NOTHING;
