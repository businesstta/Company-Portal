ALTER TABLE it_assets
  ADD COLUMN IF NOT EXISTS image_file varchar(120) NOT NULL DEFAULT '';
