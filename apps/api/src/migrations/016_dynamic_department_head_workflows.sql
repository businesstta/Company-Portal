UPDATE approval_workflow_steps
SET approver_user_id = NULL,
    updated_at = now()
WHERE request_type IN ('payment', 'advance_clearance', 'vehicle_request')
  AND step_order = 1
  AND step_name = 'Department Head Approver';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'corporate_requests_request_type_check'
  ) THEN
    ALTER TABLE corporate_requests
      DROP CONSTRAINT corporate_requests_request_type_check;
  END IF;
END $$;

ALTER TABLE corporate_requests
  ADD CONSTRAINT corporate_requests_request_type_check
  CHECK (request_type IN ('payment', 'advance_clearance', 'vehicle_request'));
