ALTER TABLE learning_courses
  ADD COLUMN IF NOT EXISTS certificate_template_type varchar(20) NOT NULL DEFAULT 'system'
    CHECK(certificate_template_type IN ('system','custom')),
  ADD COLUMN IF NOT EXISTS certificate_template_original_name varchar(255),
  ADD COLUMN IF NOT EXISTS certificate_template_stored_name varchar(255),
  ADD COLUMN IF NOT EXISTS certificate_template_mime_type varchar(150);
