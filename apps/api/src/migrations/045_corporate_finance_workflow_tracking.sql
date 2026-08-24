ALTER TABLE corporate_requests
  ADD COLUMN IF NOT EXISTS advance_status varchar(40),
  ADD COLUMN IF NOT EXISTS department_head_status varchar(20),
  ADD COLUMN IF NOT EXISTS department_head_comments text,
  ADD COLUMN IF NOT EXISTS department_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS department_head_approver_name varchar(180),
  ADD COLUMN IF NOT EXISTS transportation_supervisor_status varchar(20),
  ADD COLUMN IF NOT EXISTS transportation_supervisor_comments text,
  ADD COLUMN IF NOT EXISTS transportation_supervisor_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS transportation_supervisor_name varchar(180),
  ADD COLUMN IF NOT EXISTS finance_approver_status varchar(20),
  ADD COLUMN IF NOT EXISTS finance_approver_comments text,
  ADD COLUMN IF NOT EXISTS finance_approver_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS finance_approver_name varchar(180),
  ADD COLUMN IF NOT EXISTS cashier_status varchar(20),
  ADD COLUMN IF NOT EXISTS cashier_comments text,
  ADD COLUMN IF NOT EXISTS cashier_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS cashier_name varchar(180),
  ADD COLUMN IF NOT EXISTS receiver_status varchar(20),
  ADD COLUMN IF NOT EXISTS receiver_comments text,
  ADD COLUMN IF NOT EXISTS receiver_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS receiver_name varchar(180);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'approval_workflow_steps_request_type_check'
      AND conrelid = 'approval_workflow_steps'::regclass
  ) THEN
    ALTER TABLE approval_workflow_steps DROP CONSTRAINT approval_workflow_steps_request_type_check;
  END IF;
END $$;

ALTER TABLE approval_workflow_steps
  ADD CONSTRAINT approval_workflow_steps_request_type_check
  CHECK (request_type IN ('payment','taxi_charge','advance_clearance','vehicle_request'));

INSERT INTO approval_workflow_steps(company_id,request_type,step_order,step_name)
SELECT c.id,workflow.request_type,workflow.step_order,workflow.step_name
FROM companies c
CROSS JOIN (VALUES
  ('payment',4,'Receiver'),
  ('advance_clearance',4,'Receiver'),
  ('taxi_charge',1,'Department Head Approver'),
  ('taxi_charge',2,'Transportation Supervisor'),
  ('taxi_charge',3,'Finance Approver'),
  ('taxi_charge',4,'Cashier'),
  ('taxi_charge',5,'Receiver')
) workflow(request_type,step_order,step_name)
ON CONFLICT(company_id,request_type,step_order) DO UPDATE SET step_name=EXCLUDED.step_name;

UPDATE corporate_requests payment
SET advance_status = CASE
  WHEN EXISTS (
    SELECT 1 FROM corporate_requests clearance
    WHERE clearance.request_type='advance_clearance'
      AND clearance.status='approved'
      AND clearance.details->>'paymentRequestId'=payment.id::text
  ) THEN 'Cleared'
  ELSE 'Outstanding'
END
WHERE payment.request_type='payment'
  AND lower(COALESCE(payment.details->>'paymentType',''))='advance'
  AND payment.advance_status IS NULL;

CREATE OR REPLACE FUNCTION initialize_advance_status()
RETURNS trigger AS $$
BEGIN
  IF NEW.request_type='payment'
     AND lower(COALESCE(NEW.details->>'paymentType',''))='advance'
     AND NEW.advance_status IS NULL THEN
    NEW.advance_status := 'Outstanding';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS corporate_requests_initialize_advance_status ON corporate_requests;
CREATE TRIGGER corporate_requests_initialize_advance_status
BEFORE INSERT OR UPDATE OF details ON corporate_requests
FOR EACH ROW EXECUTE FUNCTION initialize_advance_status();

UPDATE corporate_requests request
SET
  department_head_status=action.action,
  department_head_comments=action.comment,
  department_responded_at=action.acted_at,
  department_head_approver_name=COALESCE(NULLIF(trim(employee.first_name||' '||employee.last_name),''),users.username)
FROM corporate_approval_actions action
JOIN approval_workflow_steps step ON step.step_order=action.step_order
JOIN users ON users.id=action.approver_user_id
LEFT JOIN employees employee ON employee.id=users.employee_id
WHERE request.id=action.corporate_request_id
  AND step.company_id=(SELECT company_id FROM employees WHERE id=request.employee_id)
  AND step.request_type=CASE WHEN request.request_type='payment' AND lower(COALESCE(request.details->>'paymentType',''))='taxi charge' THEN 'taxi_charge' ELSE request.request_type END
  AND lower(step.step_name) LIKE '%department%';

UPDATE corporate_requests request SET transportation_supervisor_status=action.action,transportation_supervisor_comments=action.comment,transportation_supervisor_responded_at=action.acted_at,transportation_supervisor_name=COALESCE(NULLIF(trim(employee.first_name||' '||employee.last_name),''),users.username) FROM corporate_approval_actions action JOIN approval_workflow_steps step ON step.step_order=action.step_order JOIN users ON users.id=action.approver_user_id LEFT JOIN employees employee ON employee.id=users.employee_id WHERE request.id=action.corporate_request_id AND step.company_id=(SELECT company_id FROM employees WHERE id=request.employee_id) AND step.request_type=CASE WHEN request.request_type='payment' AND lower(COALESCE(request.details->>'paymentType',''))='taxi charge' THEN 'taxi_charge' ELSE request.request_type END AND lower(step.step_name) LIKE '%transportation%';
UPDATE corporate_requests request SET finance_approver_status=action.action,finance_approver_comments=action.comment,finance_approver_responded_at=action.acted_at,finance_approver_name=COALESCE(NULLIF(trim(employee.first_name||' '||employee.last_name),''),users.username) FROM corporate_approval_actions action JOIN approval_workflow_steps step ON step.step_order=action.step_order JOIN users ON users.id=action.approver_user_id LEFT JOIN employees employee ON employee.id=users.employee_id WHERE request.id=action.corporate_request_id AND step.company_id=(SELECT company_id FROM employees WHERE id=request.employee_id) AND step.request_type=CASE WHEN request.request_type='payment' AND lower(COALESCE(request.details->>'paymentType',''))='taxi charge' THEN 'taxi_charge' ELSE request.request_type END AND lower(step.step_name) LIKE '%finance%';
UPDATE corporate_requests request SET cashier_status=action.action,cashier_comments=action.comment,cashier_responded_at=action.acted_at,cashier_name=COALESCE(NULLIF(trim(employee.first_name||' '||employee.last_name),''),users.username) FROM corporate_approval_actions action JOIN approval_workflow_steps step ON step.step_order=action.step_order JOIN users ON users.id=action.approver_user_id LEFT JOIN employees employee ON employee.id=users.employee_id WHERE request.id=action.corporate_request_id AND step.company_id=(SELECT company_id FROM employees WHERE id=request.employee_id) AND step.request_type=CASE WHEN request.request_type='payment' AND lower(COALESCE(request.details->>'paymentType',''))='taxi charge' THEN 'taxi_charge' ELSE request.request_type END AND lower(step.step_name) LIKE '%cashier%';
UPDATE corporate_requests request SET receiver_status=action.action,receiver_comments=action.comment,receiver_responded_at=action.acted_at,receiver_name=COALESCE(NULLIF(trim(employee.first_name||' '||employee.last_name),''),users.username) FROM corporate_approval_actions action JOIN approval_workflow_steps step ON step.step_order=action.step_order JOIN users ON users.id=action.approver_user_id LEFT JOIN employees employee ON employee.id=users.employee_id WHERE request.id=action.corporate_request_id AND step.company_id=(SELECT company_id FROM employees WHERE id=request.employee_id) AND step.request_type=CASE WHEN request.request_type='payment' AND lower(COALESCE(request.details->>'paymentType',''))='taxi charge' THEN 'taxi_charge' ELSE request.request_type END AND lower(step.step_name) LIKE '%receiver%';
