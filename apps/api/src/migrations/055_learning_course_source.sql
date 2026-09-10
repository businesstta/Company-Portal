ALTER TABLE learning_courses
  ADD COLUMN IF NOT EXISTS course_source varchar(30) NOT NULL DEFAULT 'internal_outsource';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'learning_courses_course_source_check'
      AND conrelid = 'learning_courses'::regclass
  ) THEN
    ALTER TABLE learning_courses
      ADD CONSTRAINT learning_courses_course_source_check
      CHECK (course_source IN ('internal_outsource', 'external_outsource'));
  END IF;
END $$;
