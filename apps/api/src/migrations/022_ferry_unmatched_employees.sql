ALTER TABLE ferry_records
  ALTER COLUMN employee_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS employee_name_myanmar varchar(180) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS employee_name_english varchar(180) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS employee_no varchar(80) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS business_units varchar(180) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS department varchar(180) NOT NULL DEFAULT '';

UPDATE ferry_records f
SET employee_name_myanmar = COALESCE(NULLIF(f.employee_name_myanmar, ''), e.name_mm, ''),
    employee_name_english = COALESCE(NULLIF(f.employee_name_english, ''), trim(e.first_name || ' ' || e.last_name), ''),
    employee_no = COALESCE(NULLIF(f.employee_no, ''), e.employee_no, ''),
    business_units = COALESCE(NULLIF(f.business_units, ''), e.organization, ''),
    department = COALESCE(NULLIF(f.department, ''), d.name, '')
FROM employees e
LEFT JOIN departments d ON d.id = e.department_id
WHERE f.employee_id = e.id;

UPDATE ferry_records SET township = 'North Okkalapa' WHERE lower(trim(township)) = 'north oakkalapa';
UPDATE ferry_records SET township = 'South Okkalapa' WHERE lower(trim(township)) = 'south oakkalapa';

CREATE INDEX IF NOT EXISTS ferry_records_employee_no_idx
  ON ferry_records(company_id, employee_no);
