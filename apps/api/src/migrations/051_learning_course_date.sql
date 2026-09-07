ALTER TABLE learning_courses
  ADD COLUMN IF NOT EXISTS course_date date;

UPDATE learning_courses
SET course_date=created_at::date
WHERE course_date IS NULL;

ALTER TABLE learning_courses
  ALTER COLUMN course_date SET DEFAULT CURRENT_DATE,
  ALTER COLUMN course_date SET NOT NULL;
