-- PostgreSQL truncates the original auto-generated 65-character constraint
-- name to the 63-character identifier below. Migration 047 attempted to drop
-- the untruncated name, leaving this constraint in place.
ALTER TABLE learning_assessment_attempts
  DROP CONSTRAINT IF EXISTS learning_assessment_attempts_course_id_employee_id_attempt_no_k;

CREATE UNIQUE INDEX IF NOT EXISTS learning_assessment_attempts_type_attempt_idx
  ON learning_assessment_attempts(course_id, employee_id, assessment_type, attempt_no);
