CREATE TABLE IF NOT EXISTS corporate_request_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corporate_request_id uuid NOT NULL REFERENCES corporate_requests(id) ON DELETE CASCADE,
  original_name varchar(255) NOT NULL,
  stored_name varchar(255) NOT NULL UNIQUE,
  mime_type varchar(120) NOT NULL,
  file_size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS corporate_request_attachments_request_idx
  ON corporate_request_attachments(corporate_request_id);
