CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
  role varchar(30) NOT NULL CHECK(role IN ('admin','hr','manager','approver','employee')),
  menu_key varchar(60) NOT NULL, allowed boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, role, menu_key)
);
CREATE TABLE IF NOT EXISTS corporate_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid NOT NULL REFERENCES employees(id),
  request_type varchar(40) NOT NULL CHECK(request_type IN ('payment','advance_clearance')),
  reference_no varchar(50) NOT NULL UNIQUE, request_date date NOT NULL DEFAULT CURRENT_DATE,
  payee varchar(180), purpose text NOT NULL, amount numeric(16,2) NOT NULL CHECK(amount >= 0),
  currency varchar(10) NOT NULL DEFAULT 'MMK', details jsonb NOT NULL DEFAULT '{}',
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('draft','pending','approved','rejected','cancelled')),
  approver_id uuid REFERENCES users(id), approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS announcement_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  original_name varchar(255) NOT NULL, stored_name varchar(255) NOT NULL UNIQUE,
  mime_type varchar(120) NOT NULL, file_size integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS corporate_requests_status_idx ON corporate_requests(status,request_type);

