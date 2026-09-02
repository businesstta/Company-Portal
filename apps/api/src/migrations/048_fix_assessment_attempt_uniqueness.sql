-- PostgreSQL truncates the original auto-generated constraint name to 63
-- characters. Migration 047 therefore did not remove it, and a Final
-- Assessment attempt #1 conflicted with the existing Pre Test attempt #1.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT constraint.conname
  INTO constraint_name
  FROM pg_constraint AS constraint
  WHERE constraint.conrelid = 'learning_assessment_attempts'::regclass
    AND constraint.contype = 'u'
    AND (
      SELECT array_agg(attribute.attname ORDER BY attribute.attname)
      FROM unnest(constraint.conkey) AS key(attnum)
      JOIN pg_attribute AS attribute
        ON attribute.attrelid = constraint.conrelid
       AND attribute.attnum = key.attnum
    ) = ARRAY['attempt_no', 'course_id', 'employee_id']::name[]
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE learning_assessment_attempts DROP CONSTRAINT %I',
      constraint_name
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS learning_assessment_attempts_type_attempt_idx
  ON learning_assessment_attempts(course_id, employee_id, assessment_type, attempt_no);
