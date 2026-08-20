INSERT INTO users (employee_id, email, username, password_hash, role)
SELECT e.id,
       e.email,
       CASE
         WHEN EXISTS (
           SELECT 1 FROM users existing
           WHERE lower(existing.username) = lower(trim(e.first_name || ' ' || e.last_name))
         ) THEN lower(trim(e.first_name || ' ' || e.last_name)) || ' ' || lower(e.employee_no)
         ELSE lower(trim(e.first_name || ' ' || e.last_name))
       END,
       crypt(encode(gen_random_bytes(24), 'hex'), gen_salt('bf', 12)),
       'employee'
FROM employees e
LEFT JOIN users u ON u.employee_id = e.id
WHERE u.id IS NULL
ON CONFLICT (employee_id) DO NOTHING;
