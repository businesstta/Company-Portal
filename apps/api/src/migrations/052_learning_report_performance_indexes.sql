CREATE INDEX IF NOT EXISTS employees_company_active_report_idx
  ON employees(company_id,employee_no)
  WHERE employment_status='active';

CREATE INDEX IF NOT EXISTS learning_progress_content_employee_idx
  ON learning_content_progress(content_id,employee_id);

CREATE INDEX IF NOT EXISTS learning_attempts_final_course_employee_idx
  ON learning_assessment_attempts(course_id,employee_id)
  WHERE assessment_type='final';

CREATE INDEX IF NOT EXISTS learning_certificates_valid_course_employee_idx
  ON learning_certificates(course_id,employee_id)
  WHERE status='valid';
