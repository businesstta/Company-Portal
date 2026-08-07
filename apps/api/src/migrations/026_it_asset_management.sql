CREATE TABLE IF NOT EXISTS it_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  asset_name varchar(180) NOT NULL,
  asset_tag_code varchar(100) NOT NULL,
  category varchar(100) NOT NULL,
  brand_manufacturer varchar(150) NOT NULL DEFAULT '',
  model_name varchar(150) NOT NULL DEFAULT '',
  serial_number varchar(150) NOT NULL DEFAULT '',
  asset_type varchar(80) NOT NULL,
  processor_cpu varchar(180) NOT NULL DEFAULT '',
  ram_memory varchar(120) NOT NULL DEFAULT '',
  storage varchar(120) NOT NULL DEFAULT '',
  gpu varchar(180) NOT NULL DEFAULT '',
  operating_system varchar(180) NOT NULL DEFAULT '',
  status varchar(40) NOT NULL DEFAULT 'In Stock',
  office_location varchar(180) NOT NULL DEFAULT '',
  current_assigned_user varchar(180) NOT NULL DEFAULT '',
  department varchar(150) NOT NULL DEFAULT '',
  purchase_date date,
  purchase_price numeric(18,2),
  vendor_supplier varchar(180) NOT NULL DEFAULT '',
  invoice_po_number varchar(120) NOT NULL DEFAULT '',
  warranty_expiry_date date,
  barcode varchar(180) NOT NULL DEFAULT '',
  qr_code varchar(300) NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE it_assets DROP CONSTRAINT IF EXISTS it_assets_company_id_asset_tag_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS it_assets_company_asset_tag_active_uidx
  ON it_assets(company_id,lower(asset_tag_code)) WHERE is_active=true;
CREATE INDEX IF NOT EXISTS it_assets_company_status_idx ON it_assets(company_id,status) WHERE is_active=true;
CREATE INDEX IF NOT EXISTS it_assets_company_type_idx ON it_assets(company_id,asset_type) WHERE is_active=true;

UPDATE it_assets
SET barcode=asset_tag_code,
    qr_code='IT-ASSET:' || asset_tag_code,
    updated_at=now()
WHERE barcode='' OR qr_code='';

INSERT INTO role_permissions(company_id,role,menu_key,allowed)
SELECT ur.company_id,ur.role_key,'IT Asset Management',
       CASE WHEN ur.role_key='admin' THEN true ELSE COALESCE(parent.allowed,false) END
FROM user_roles ur
LEFT JOIN role_permissions parent
  ON parent.company_id=ur.company_id AND parent.role=ur.role_key AND parent.menu_key='Information Technology'
ON CONFLICT(company_id,role,menu_key) DO NOTHING;
