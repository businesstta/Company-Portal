ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS probation_date date;

CREATE TABLE IF NOT EXISTS employee_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  original_name varchar(255) NOT NULL,
  stored_name varchar(255) NOT NULL UNIQUE,
  mime_type varchar(150) NOT NULL,
  file_size bigint NOT NULL CHECK(file_size >= 0),
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_attachments_employee_idx
  ON employee_attachments(employee_id, created_at DESC);
