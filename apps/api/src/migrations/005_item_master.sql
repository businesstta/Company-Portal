ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS hr_master_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
  item_type varchar(40) NOT NULL CHECK(item_type IN ('organization','project_location')),
  name varchar(180) NOT NULL, is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,item_type,name)
);
