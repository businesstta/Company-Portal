ALTER TABLE learning_modules
  ADD COLUMN IF NOT EXISTS credit numeric(8,2) NOT NULL DEFAULT 0 CHECK(credit>=0);
