CREATE TABLE IF NOT EXISTS approval_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  request_type varchar(40) NOT NULL CHECK (request_type IN ('payment', 'advance_clearance')),
  step_order integer NOT NULL CHECK (step_order BETWEEN 1 AND 20),
  step_name varchar(120) NOT NULL,
  approver_user_id uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, request_type, step_order)
);

INSERT INTO approval_workflow_steps(company_id,request_type,step_order,step_name)
SELECT c.id, workflow.request_type, workflow.step_order, workflow.step_name
FROM companies c
CROSS JOIN (VALUES
  ('payment',1,'Department Head Approver'),
  ('payment',2,'Finance Approver'),
  ('payment',3,'Cashier'),
  ('advance_clearance',1,'Department Head Approver'),
  ('advance_clearance',2,'Finance Approver'),
  ('advance_clearance',3,'Cashier')
) workflow(request_type,step_order,step_name)
ON CONFLICT(company_id,request_type,step_order) DO NOTHING;

INSERT INTO role_permissions(company_id,role,menu_key,allowed)
SELECT c.id, role_name, menu_key, role_name IN ('admin','hr')
FROM companies c
CROSS JOIN unnest(ARRAY['admin','hr','manager','approver','employee']) role_name
CROSS JOIN unnest(ARRAY['Banner','Approval Setup']) menu_key
ON CONFLICT(company_id,role,menu_key) DO NOTHING;
