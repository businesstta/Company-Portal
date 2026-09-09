ALTER TABLE learning_courses
  ADD COLUMN IF NOT EXISTS main_category_id uuid REFERENCES hr_course_masters(id),
  ADD COLUMN IF NOT EXISTS employee_level_id uuid REFERENCES hr_course_masters(id),
  ADD COLUMN IF NOT EXISTS training_type_id uuid REFERENCES hr_course_masters(id),
  ADD COLUMN IF NOT EXISTS course_category_id uuid REFERENCES hr_course_masters(id);

