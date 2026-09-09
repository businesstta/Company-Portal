CREATE TABLE hr_course_masters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  item_type text NOT NULL CHECK (item_type IN ('main_category','employee_level','training_type','course_category')),
  code varchar(50) NOT NULL CHECK (length(trim(code)) > 0),
  name varchar(180) NOT NULL CHECK (length(trim(name)) > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX hr_course_masters_code ON hr_course_masters(company_id,item_type,lower(code));
INSERT INTO role_permissions(company_id,role,menu_key,allowed)
SELECT company_id,role_key,'HR Item Master',role_key IN ('admin','hr') FROM user_roles
ON CONFLICT(company_id,role,menu_key) DO NOTHING;
