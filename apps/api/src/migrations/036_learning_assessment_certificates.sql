CREATE TABLE IF NOT EXISTS learning_content_progress (
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES learning_module_contents(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(employee_id,content_id)
);

CREATE TABLE IF NOT EXISTS learning_assessment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES learning_courses(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type varchar(20) NOT NULL DEFAULT 'single_choice' CHECK(question_type IN ('single_choice','multiple_choice','true_false')),
  options jsonb NOT NULL DEFAULT '[]',
  correct_answers jsonb NOT NULL DEFAULT '[]',
  points numeric(8,2) NOT NULL DEFAULT 1 CHECK(points>0),
  sequence_no integer NOT NULL CHECK(sequence_no>0),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_id,sequence_no)
);

CREATE TABLE IF NOT EXISTS learning_assessment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES learning_courses(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  attempt_no integer NOT NULL CHECK(attempt_no>0),
  answers jsonb NOT NULL DEFAULT '{}',
  score numeric(5,2) NOT NULL CHECK(score BETWEEN 0 AND 100),
  passed boolean NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_id,employee_id,attempt_no)
);

CREATE TABLE IF NOT EXISTS learning_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_no varchar(60) NOT NULL UNIQUE,
  course_id uuid NOT NULL REFERENCES learning_courses(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  attempt_id uuid NOT NULL REFERENCES learning_assessment_attempts(id),
  score numeric(5,2) NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  status varchar(20) NOT NULL DEFAULT 'valid' CHECK(status IN ('valid','revoked')),
  UNIQUE(course_id,employee_id)
);

CREATE INDEX IF NOT EXISTS learning_progress_employee_idx ON learning_content_progress(employee_id);
CREATE INDEX IF NOT EXISTS learning_attempts_employee_course_idx ON learning_assessment_attempts(employee_id,course_id);
