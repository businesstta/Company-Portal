CREATE TABLE IF NOT EXISTS learning_job_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  level_key varchar(40) NOT NULL,
  level_name varchar(80) NOT NULL,
  level_rank integer NOT NULL CHECK(level_rank BETWEEN 1 AND 99),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, level_key),
  UNIQUE(company_id, level_rank)
);

INSERT INTO learning_job_levels(company_id,level_key,level_name,level_rank)
SELECT c.id,v.level_key,v.level_name,v.level_rank
FROM companies c
CROSS JOIN (VALUES
  ('employee','Employee',1),('supervisor','Supervisor',2),
  ('assistant_manager','Assistant Manager',3),('manager','Manager',4),
  ('hod','HOD',5),('director','Director',6),('c_level','C-Level',7)
) AS v(level_key,level_name,level_rank)
ON CONFLICT(company_id,level_key) DO UPDATE SET level_name=EXCLUDED.level_name,level_rank=EXCLUDED.level_rank,is_active=true,updated_at=now();

ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_level_id uuid REFERENCES learning_job_levels(id);

CREATE TABLE IF NOT EXISTS learning_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  course_code varchar(30) NOT NULL,
  title varchar(180) NOT NULL,
  description text,
  category varchar(100),
  delivery_method varchar(30) NOT NULL DEFAULT 'self_paced' CHECK(delivery_method IN ('self_paced','classroom','online','blended')),
  assignment_mode varchar(20) NOT NULL DEFAULT 'progressive' CHECK(assignment_mode IN ('exact','progressive','custom')),
  is_mandatory boolean NOT NULL DEFAULT true,
  duration_minutes integer NOT NULL DEFAULT 0 CHECK(duration_minutes>=0),
  status varchar(20) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','inactive','archived')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,course_code)
);

CREATE TABLE IF NOT EXISTS learning_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES learning_courses(id) ON DELETE CASCADE,
  module_code varchar(30) NOT NULL,
  title varchar(180) NOT NULL,
  description text,
  sequence_no integer NOT NULL CHECK(sequence_no>0),
  audience_type varchar(20) NOT NULL DEFAULT 'all' CHECK(audience_type IN ('all','job_levels')),
  is_mandatory boolean NOT NULL DEFAULT true,
  duration_minutes integer NOT NULL DEFAULT 0 CHECK(duration_minutes>=0),
  passing_score numeric(5,2) CHECK(passing_score BETWEEN 0 AND 100),
  max_attempts integer NOT NULL DEFAULT 3 CHECK(max_attempts>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_id,module_code),
  UNIQUE(course_id,sequence_no)
);

CREATE TABLE IF NOT EXISTS learning_module_target_levels (
  module_id uuid NOT NULL REFERENCES learning_modules(id) ON DELETE CASCADE,
  job_level_id uuid NOT NULL REFERENCES learning_job_levels(id),
  PRIMARY KEY(module_id,job_level_id)
);

CREATE INDEX IF NOT EXISTS learning_courses_company_status_idx ON learning_courses(company_id,status);
CREATE INDEX IF NOT EXISTS learning_modules_course_sequence_idx ON learning_modules(course_id,sequence_no);
