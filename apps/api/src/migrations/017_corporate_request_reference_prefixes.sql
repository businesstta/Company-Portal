CREATE OR REPLACE FUNCTION assign_prf_reference()
RETURNS trigger AS $$
DECLARE
  candidate text;
  reference_prefix text;
BEGIN
  reference_prefix := CASE NEW.request_type
    WHEN 'vehicle_request' THEN 'VRF'
    WHEN 'advance_clearance' THEN 'ACR'
    ELSE 'PRF'
  END;

  IF NEW.reference_no IS NOT NULL AND NEW.reference_no ~ ('^' || reference_prefix || '-[0-9]{4}-[0-9]{7}$') THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(742619);
  LOOP
    candidate := reference_prefix || '-' || EXTRACT(YEAR FROM CURRENT_DATE)::int || '-' || (1000000 + floor(random() * 9000000))::int;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM corporate_requests WHERE reference_no = candidate);
  END LOOP;
  NEW.reference_no := candidate;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE corporate_requests
SET reference_no = CASE request_type
  WHEN 'vehicle_request' THEN regexp_replace(reference_no, '^[A-Z]+-', 'VRF-')
  WHEN 'advance_clearance' THEN regexp_replace(reference_no, '^[A-Z]+-', 'ACR-')
  WHEN 'payment' THEN regexp_replace(reference_no, '^[A-Z]+-', 'PRF-')
  ELSE reference_no
END
WHERE request_type IN ('payment', 'advance_clearance', 'vehicle_request')
  AND reference_no IS NOT NULL;
