ALTER TABLE learning_module_contents
  ADD COLUMN IF NOT EXISTS content_body text;

ALTER TABLE learning_module_contents
  DROP CONSTRAINT IF EXISTS learning_module_contents_content_type_check;

ALTER TABLE learning_module_contents
  DROP CONSTRAINT IF EXISTS learning_module_contents_check;

ALTER TABLE learning_module_contents
  DROP CONSTRAINT IF EXISTS learning_module_contents_payload_check;

ALTER TABLE learning_module_contents
  ADD CONSTRAINT learning_module_contents_content_type_check
  CHECK(content_type IN ('youtube','file','document'));

ALTER TABLE learning_module_contents
  ADD CONSTRAINT learning_module_contents_payload_check
  CHECK(
    (content_type='youtube' AND youtube_url IS NOT NULL AND youtube_video_id IS NOT NULL)
    OR (content_type='file' AND stored_name IS NOT NULL AND original_name IS NOT NULL)
    OR (content_type='document' AND content_body IS NOT NULL AND length(trim(content_body))>0)
  );
