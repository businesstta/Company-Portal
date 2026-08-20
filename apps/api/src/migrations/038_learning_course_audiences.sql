CREATE TABLE IF NOT EXISTS learning_course_audience_types (
  course_id uuid NOT NULL REFERENCES learning_courses(id) ON DELETE CASCADE,
  audience_type varchar(30) NOT NULL CHECK(audience_type IN ('all_employees','specific_employees','rank')),
  PRIMARY KEY(course_id,audience_type)
);

CREATE TABLE IF NOT EXISTS learning_course_employee_targets (
  course_id uuid NOT NULL REFERENCES learning_courses(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  PRIMARY KEY(course_id,employee_id)
);

CREATE TABLE IF NOT EXISTS learning_course_rank_targets (
  course_id uuid NOT NULL REFERENCES learning_courses(id) ON DELETE CASCADE,
  job_level_id uuid NOT NULL REFERENCES learning_job_levels(id) ON DELETE CASCADE,
  PRIMARY KEY(course_id,job_level_id)
);

INSERT INTO learning_course_audience_types(course_id,audience_type)
SELECT id,'all_employees' FROM learning_courses
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS learning_course_employee_targets_employee_idx ON learning_course_employee_targets(employee_id);
CREATE INDEX IF NOT EXISTS learning_course_rank_targets_rank_idx ON learning_course_rank_targets(job_level_id);
