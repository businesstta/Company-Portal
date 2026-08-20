CREATE TABLE IF NOT EXISTS learning_module_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES learning_modules(id) ON DELETE CASCADE,
  content_type varchar(20) NOT NULL CHECK(content_type IN ('youtube','file')),
  title varchar(180) NOT NULL,
  youtube_url text,
  youtube_video_id varchar(20),
  original_name varchar(255),
  stored_name varchar(255),
  mime_type varchar(150),
  file_size bigint,
  sequence_no integer NOT NULL DEFAULT 1 CHECK(sequence_no>0),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(
    (content_type='youtube' AND youtube_url IS NOT NULL AND youtube_video_id IS NOT NULL)
    OR
    (content_type='file' AND stored_name IS NOT NULL AND original_name IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS learning_module_contents_module_sequence_idx
  ON learning_module_contents(module_id,sequence_no);
