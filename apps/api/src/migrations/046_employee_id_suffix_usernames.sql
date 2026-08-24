DROP INDEX IF EXISTS users_username_lower_unique;

WITH username_candidates AS (
  SELECT
    users.id,
    COALESCE(NULLIF(regexp_replace(employees.employee_no, '^.*-', ''), ''), employees.employee_no) AS base_username,
    row_number() OVER (
      PARTITION BY lower(COALESCE(NULLIF(regexp_replace(employees.employee_no, '^.*-', ''), ''), employees.employee_no))
      ORDER BY users.created_at, users.id
    ) AS duplicate_number
  FROM users
  JOIN employees ON employees.id=users.employee_id
  WHERE users.role<>'admin'
)
UPDATE users
SET username = CASE
  WHEN username_candidates.duplicate_number=1 THEN username_candidates.base_username
  ELSE username_candidates.base_username||'-'||username_candidates.duplicate_number
END
FROM username_candidates
WHERE username_candidates.id=users.id;

CREATE UNIQUE INDEX users_username_lower_unique
  ON users(lower(username)) WHERE username IS NOT NULL;

