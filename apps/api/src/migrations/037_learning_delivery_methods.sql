ALTER TABLE learning_courses
  DROP CONSTRAINT IF EXISTS learning_courses_delivery_method_check;

UPDATE learning_courses
SET delivery_method=CASE
  WHEN delivery_method='online' THEN 'online'
  WHEN delivery_method='classroom' THEN 'classroom'
  WHEN delivery_method='blended' THEN 'in_person'
  WHEN delivery_method='self_paced' THEN 'online'
  ELSE 'in_person'
END;

ALTER TABLE learning_courses
  ALTER COLUMN delivery_method SET DEFAULT 'in_person';

ALTER TABLE learning_courses
  ADD CONSTRAINT learning_courses_delivery_method_check
  CHECK(delivery_method IN ('in_person','online','classroom','training_room'));
