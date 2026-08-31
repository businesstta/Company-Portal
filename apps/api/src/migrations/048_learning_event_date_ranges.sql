ALTER TABLE learning_training_events
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time time;

UPDATE learning_training_events
SET start_date=COALESCE(start_date,starts_at::date),
    end_date=COALESCE(end_date,ends_at::date),
    start_time=COALESCE(start_time,starts_at::time),
    end_time=COALESCE(end_time,ends_at::time)
WHERE start_date IS NULL OR end_date IS NULL OR start_time IS NULL OR end_time IS NULL;

ALTER TABLE learning_training_events
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN end_date SET NOT NULL,
  ALTER COLUMN start_time SET NOT NULL,
  ALTER COLUMN end_time SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE learning_training_events ADD CONSTRAINT learning_training_event_date_range_check CHECK(end_date>=start_date);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE learning_training_events ADD CONSTRAINT learning_training_event_daily_time_check CHECK(end_time>start_time);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS learning_training_events_date_range_idx
  ON learning_training_events(company_id,start_date,end_date);
