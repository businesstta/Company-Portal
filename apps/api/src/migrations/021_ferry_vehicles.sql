CREATE TABLE IF NOT EXISTS ferry_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vehicle_name varchar(180) NOT NULL,
  vehicle_type varchar(120) NOT NULL DEFAULT '',
  vehicle_number varchar(80) NOT NULL,
  driver_name varchar(180) NOT NULL DEFAULT '',
  driver_phone_number varchar(60) NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ferry_vehicles_company_number_unique
  ON ferry_vehicles(company_id, lower(vehicle_number))
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS ferry_vehicles_company_active_idx
  ON ferry_vehicles(company_id, is_active, created_at DESC);
