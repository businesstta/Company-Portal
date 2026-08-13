CREATE TABLE IF NOT EXISTS it_asset_write_offs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES companies(id),
  asset_id uuid NOT NULL REFERENCES it_assets(id),
  asset_snapshot jsonb NOT NULL,
  written_off_at timestamptz NOT NULL DEFAULT now(),
  written_off_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS it_asset_write_offs_company_date_idx
  ON it_asset_write_offs(company_id,written_off_at DESC);

CREATE INDEX IF NOT EXISTS it_asset_write_offs_asset_idx
  ON it_asset_write_offs(asset_id);
