ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS vehicle_category varchar(30) NOT NULL DEFAULT 'internal';

ALTER TABLE vehicles
  DROP CONSTRAINT IF EXISTS vehicles_category_check;

ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_category_check
  CHECK (vehicle_category IN ('internal', 'maintenance'));

ALTER TABLE vehicles
  DROP CONSTRAINT IF EXISTS vehicles_company_id_vehicle_plate_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_company_category_plate_unique
  ON vehicles(company_id, vehicle_category, lower(vehicle_plate_number))
  WHERE is_active = true;

INSERT INTO role_permissions(company_id, role, menu_key, allowed)
SELECT c.id, role_name, 'Vehicle Management (Maintenance)', role_name IN ('admin', 'hr', 'manager')
FROM companies c
CROSS JOIN unnest(ARRAY['admin','hr','manager','approver','employee']) role_name
ON CONFLICT(company_id, role, menu_key) DO NOTHING;
