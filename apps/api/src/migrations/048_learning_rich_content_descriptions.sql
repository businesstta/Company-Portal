ALTER TABLE learning_module_contents
  DROP CONSTRAINT IF EXISTS learning_module_contents_description_length_check;

ALTER TABLE learning_module_contents
  ADD CONSTRAINT learning_module_contents_description_length_check
  CHECK(description IS NULL OR length(description)<=500000);
