CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(150) NOT NULL,
  timezone varchar(50) NOT NULL DEFAULT 'Asia/Yangon',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
  name varchar(100) NOT NULL, code varchar(20) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, code)
);
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
  department_id uuid REFERENCES departments(id), manager_id uuid REFERENCES employees(id),
  employee_no varchar(30) NOT NULL UNIQUE, first_name varchar(80) NOT NULL, last_name varchar(80) NOT NULL DEFAULT '',
  email varchar(180) NOT NULL UNIQUE, phone varchar(40), position varchar(120), work_location varchar(150),
  employment_status varchar(20) NOT NULL DEFAULT 'active', joined_on date, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid UNIQUE REFERENCES employees(id),
  email varchar(180) NOT NULL UNIQUE, password_hash text NOT NULL, role varchar(30) NOT NULL CHECK(role IN ('admin','hr','manager','approver','employee')),
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), last_login_at timestamptz
);
CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid NOT NULL REFERENCES employees(id), work_date date NOT NULL,
  check_in timestamptz, check_out timestamptz, check_in_lat numeric(9,6), check_in_lng numeric(9,6), check_out_lat numeric(9,6), check_out_lng numeric(9,6),
  status varchar(20) NOT NULL DEFAULT 'present', source varchar(20) NOT NULL DEFAULT 'mobile', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, work_date)
);
CREATE TABLE IF NOT EXISTS requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid NOT NULL REFERENCES employees(id),
  request_type varchar(30) NOT NULL CHECK(request_type IN ('leave','overtime','late_in','early_out','attendance_correction','appraisal')),
  title varchar(180) NOT NULL, reason text, start_at timestamptz, end_at timestamptz, payload jsonb NOT NULL DEFAULT '{}',
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('draft','pending','approved','rejected','cancelled')),
  current_approver_id uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS approval_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES requests(id), approver_id uuid NOT NULL REFERENCES users(id),
  action varchar(20) NOT NULL CHECK(action IN ('submitted','approved','rejected','commented')), comment text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), department_id uuid REFERENCES departments(id),
  title varchar(200) NOT NULL, body text NOT NULL, published_at timestamptz, created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_work_date_idx ON attendance(work_date);
CREATE INDEX IF NOT EXISTS requests_status_idx ON requests(status, request_type);
CREATE INDEX IF NOT EXISTS employees_department_idx ON employees(department_id);
