ALTER TABLE ferry_records
  ALTER COLUMN pickup_latitude TYPE numeric(18,14),
  ALTER COLUMN pickup_longitude TYPE numeric(18,14),
  ALTER COLUMN drop_latitude TYPE numeric(18,14),
  ALTER COLUMN drop_longitude TYPE numeric(18,14);
