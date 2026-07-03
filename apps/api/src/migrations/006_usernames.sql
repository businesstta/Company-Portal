ALTER TABLE users ADD COLUMN IF NOT EXISTS username varchar(180);

WITH ranked AS (
  SELECT u.id,
         lower(trim(e.first_name || ' ' || e.last_name)) AS base_username,
         row_number() OVER (
           PARTITION BY lower(trim(e.first_name || ' ' || e.last_name))
           ORDER BY u.created_at, u.id
         ) AS duplicate_number
  FROM users u
  JOIN employees e ON e.id = u.employee_id
)
UPDATE users u
SET username = CASE
  WHEN ranked.duplicate_number = 1 THEN ranked.base_username
  ELSE ranked.base_username || ' ' || ranked.duplicate_number
END
FROM ranked
WHERE ranked.id = u.id AND (u.username IS NULL OR trim(u.username) = '');

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
  ON users (lower(username)) WHERE username IS NOT NULL;
