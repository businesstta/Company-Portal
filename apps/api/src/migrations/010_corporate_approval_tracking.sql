ALTER TABLE corporate_requests
  ADD COLUMN IF NOT EXISTS current_step integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS corporate_approval_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corporate_request_id uuid NOT NULL REFERENCES corporate_requests(id) ON DELETE CASCADE,
  step_order integer NOT NULL,
  approver_user_id uuid NOT NULL REFERENCES users(id),
  action varchar(20) NOT NULL CHECK(action IN ('approved','rejected')),
  comment text,
  acted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(corporate_request_id,step_order)
);
