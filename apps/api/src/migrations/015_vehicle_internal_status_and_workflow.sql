ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'Free';

ALTER TABLE vehicles
  DROP CONSTRAINT IF EXISTS vehicles_status_check;

ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_status_check CHECK (status IN ('Free', 'Busy'));

INSERT INTO role_permissions(company_id, role, menu_key, allowed)
SELECT company_id, role, 'Vehicle Management (Internal)', allowed
FROM role_permissions
WHERE menu_key = 'Vehicle Management'
ON CONFLICT(company_id, role, menu_key) DO UPDATE
SET allowed = role_permissions.allowed OR EXCLUDED.allowed;

DELETE FROM role_permissions
WHERE menu_key = 'Vehicle Management';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'approval_workflow_steps_request_type_check'
  ) THEN
    ALTER TABLE approval_workflow_steps
      DROP CONSTRAINT approval_workflow_steps_request_type_check;
  END IF;
END $$;

ALTER TABLE approval_workflow_steps
  ADD CONSTRAINT approval_workflow_steps_request_type_check
  CHECK (request_type IN ('payment', 'advance_clearance', 'vehicle_request'));

INSERT INTO approval_workflow_steps(company_id, request_type, step_order, step_name)
SELECT c.id, workflow.request_type, workflow.step_order, workflow.step_name
FROM companies c
CROSS JOIN (VALUES
  ('vehicle_request', 1, 'Department Head Approver'),
  ('vehicle_request', 2, 'Transportation Supervisor')
) workflow(request_type, step_order, step_name)
ON CONFLICT(company_id, request_type, step_order) DO NOTHING;

INSERT INTO role_permissions(company_id, role, menu_key, allowed)
SELECT c.id, role_name, 'Vehicle Management (Internal)', role_name IN ('admin', 'hr', 'manager')
FROM companies c
CROSS JOIN unnest(ARRAY['admin','hr','manager','approver','employee']) role_name
ON CONFLICT(company_id, role, menu_key) DO NOTHING;
