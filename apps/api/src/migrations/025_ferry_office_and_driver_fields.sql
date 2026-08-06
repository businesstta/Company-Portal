ALTER TABLE ferry_records
  ADD COLUMN IF NOT EXISTS office_address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS office_latitude numeric(18,14),
  ADD COLUMN IF NOT EXISTS office_longitude numeric(18,14),
  ADD COLUMN IF NOT EXISTS driver_name varchar(180) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS driver_phone_number varchar(60) NOT NULL DEFAULT '';
