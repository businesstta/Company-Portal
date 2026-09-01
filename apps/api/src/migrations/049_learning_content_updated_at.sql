ALTER TABLE learning_module_contents
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
