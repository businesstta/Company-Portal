CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vehicle_name varchar(180) NOT NULL,
  vehicle_type varchar(120) NOT NULL DEFAULT '',
  vehicle_plate_number varchar(80) NOT NULL,
  driver_name varchar(180) NOT NULL DEFAULT '',
  phone_no varchar(60) NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, vehicle_plate_number)
);

CREATE INDEX IF NOT EXISTS vehicles_company_active_idx
  ON vehicles(company_id, is_active, created_at DESC);

INSERT INTO role_permissions(company_id, role, menu_key, allowed)
SELECT DISTINCT e.company_id, role_name, 'Vehicle Management (Internal)',
       CASE WHEN role_name IN ('admin', 'hr', 'manager') THEN true ELSE false END
FROM employees e
CROSS JOIN (VALUES ('admin'), ('hr'), ('manager'), ('approver'), ('employee')) roles(role_name)
ON CONFLICT(company_id, role, menu_key) DO NOTHING;
