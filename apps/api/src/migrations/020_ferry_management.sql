CREATE TABLE IF NOT EXISTS ferry_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id),
  contact_phone_number varchar(60) NOT NULL DEFAULT '',
  vehicle_number varchar(80) NOT NULL DEFAULT '',
  ferry_point varchar(180) NOT NULL DEFAULT '',
  ferry_pickup_point varchar(300) NOT NULL DEFAULT '',
  pickup_latitude numeric(10,7),
  pickup_longitude numeric(10,7),
  ferry_drop_point varchar(300) NOT NULL DEFAULT '',
  drop_latitude numeric(10,7),
  drop_longitude numeric(10,7),
  township varchar(120) NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  pickup_time time,
  drop_time time,
  way varchar(120) NOT NULL DEFAULT '',
  point varchar(120) NOT NULL DEFAULT '',
  arrival_time time,
  remark text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ferry_records_company_active_idx
  ON ferry_records(company_id, is_active, created_at DESC);

INSERT INTO role_permissions(company_id, role, menu_key, allowed)
SELECT c.id, role_name, 'Ferry Management', role_name IN ('admin', 'hr', 'manager')
FROM companies c
CROSS JOIN unnest(ARRAY['admin','hr','manager','approver','employee']) role_name
ON CONFLICT(company_id, role, menu_key) DO NOTHING;
