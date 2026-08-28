ALTER TABLE learning_assessment_attempts
  ADD COLUMN IF NOT EXISTS assessment_type varchar(20) NOT NULL DEFAULT 'final';

ALTER TABLE learning_assessment_attempts
  DROP CONSTRAINT IF EXISTS learning_assessment_attempts_course_id_employee_id_attempt_no_key;

CREATE UNIQUE INDEX IF NOT EXISTS learning_assessment_attempts_type_attempt_idx
  ON learning_assessment_attempts(course_id,employee_id,assessment_type,attempt_no);

DO $$ BEGIN
  ALTER TABLE learning_assessment_attempts
    ADD CONSTRAINT learning_assessment_attempts_type_check
    CHECK (assessment_type IN ('pre_test','final'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS learning_training_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  title varchar(180) NOT NULL,
  description text,
  venue varchar(250),
  trainer varchar(180),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  status varchar(20) NOT NULL DEFAULT 'scheduled' CHECK(status IN ('draft','scheduled','cancelled')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS learning_training_events_company_dates_idx
  ON learning_training_events(company_id, starts_at, ends_at);

INSERT INTO role_permissions(company_id,role,menu_key,allowed)
SELECT company_id,role,'L&D Schedule',allowed
FROM role_permissions
WHERE menu_key='Learning Management'
ON CONFLICT(company_id,role,menu_key) DO NOTHING;
