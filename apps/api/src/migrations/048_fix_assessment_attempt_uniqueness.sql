-- PostgreSQL may truncate generated constraint names by distributing the
-- available identifier length across their parts. Find the legacy constraint
-- by its columns instead of depending on its generated name.
DO $$
DECLARE
  legacy_constraint record;
  assessment_type_attribute smallint;
BEGIN
  SELECT attnum
    INTO assessment_type_attribute
  FROM pg_attribute
  WHERE attrelid = 'learning_assessment_attempts'::regclass
    AND attname = 'assessment_type';

  FOR legacy_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'learning_assessment_attempts'::regclass
      AND contype = 'u'
      AND cardinality(conkey) = 3
      AND NOT (assessment_type_attribute = ANY(conkey))
  LOOP
    EXECUTE format(
      'ALTER TABLE learning_assessment_attempts DROP CONSTRAINT %I',
      legacy_constraint.conname
    );
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS learning_assessment_attempts_type_attempt_idx
  ON learning_assessment_attempts(course_id, employee_id, assessment_type, attempt_no);
