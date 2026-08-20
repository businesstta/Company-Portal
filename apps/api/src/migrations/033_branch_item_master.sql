ALTER TABLE hr_master_items
  DROP CONSTRAINT IF EXISTS hr_master_items_item_type_check;

ALTER TABLE hr_master_items
  ADD CONSTRAINT hr_master_items_item_type_check
  CHECK(item_type IN ('organization','project_location','branch'));

INSERT INTO hr_master_items(company_id,item_type,name)
SELECT DISTINCT company_id,'branch',trim(branch)
FROM employees
WHERE branch IS NOT NULL AND trim(branch)<>''
ON CONFLICT(company_id,item_type,name) DO UPDATE
SET is_active=true,updated_at=now();
