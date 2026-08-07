UPDATE it_assets
SET category = 'Hardware', updated_at = now()
WHERE category NOT IN ('Hardware', 'Software');

ALTER TABLE it_assets
  DROP CONSTRAINT IF EXISTS it_assets_category_check;

ALTER TABLE it_assets
  ADD CONSTRAINT it_assets_category_check
  CHECK (category IN ('Hardware', 'Software'));
