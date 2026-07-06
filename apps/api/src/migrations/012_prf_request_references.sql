CREATE OR REPLACE FUNCTION assign_prf_reference()
RETURNS trigger AS $$
DECLARE
  candidate text;
BEGIN
  PERFORM pg_advisory_xact_lock(742619);
  LOOP
    candidate := 'PRF-' || EXTRACT(YEAR FROM CURRENT_DATE)::int || '-' || (1000000 + floor(random() * 9000000))::int;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM corporate_requests WHERE reference_no = candidate);
  END LOOP;
  NEW.reference_no := candidate;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS corporate_requests_prf_reference ON corporate_requests;
CREATE TRIGGER corporate_requests_prf_reference
BEFORE INSERT ON corporate_requests
FOR EACH ROW EXECUTE FUNCTION assign_prf_reference();

DO $$
DECLARE
  request_row record;
  candidate text;
BEGIN
  PERFORM pg_advisory_xact_lock(742619);
  FOR request_row IN SELECT id, EXTRACT(YEAR FROM created_at)::int request_year FROM corporate_requests WHERE reference_no NOT LIKE 'PRF-%'
  LOOP
    LOOP
      candidate := 'PRF-' || request_row.request_year || '-' || (1000000 + floor(random() * 9000000))::int;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM corporate_requests WHERE reference_no = candidate);
    END LOOP;
    UPDATE corporate_requests SET reference_no = candidate WHERE id = request_row.id;
  END LOOP;
END $$;
