CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  role_key varchar(30) NOT NULL CHECK(role_key ~ '^[a-z][a-z0-9_]{1,29}$'),
  role_name varchar(80) NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, role_key),
  UNIQUE(company_id, role_name)
);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_check;

INSERT INTO user_roles(company_id, role_key, role_name, is_system)
SELECT c.id, role_key, role_name, true
FROM companies c
CROSS JOIN (VALUES
  ('admin','Admin'),
  ('hr','HR'),
  ('manager','Manager'),
  ('approver','Approver'),
  ('employee','Employee')
) roles(role_key, role_name)
ON CONFLICT(company_id, role_key) DO NOTHING;
