ALTER TABLE learning_courses
  ADD COLUMN IF NOT EXISTS certificate_title varchar(180) NOT NULL DEFAULT 'Certificate of Completion';
