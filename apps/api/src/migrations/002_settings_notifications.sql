CREATE TABLE IF NOT EXISTS system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
  setting_key varchar(100) NOT NULL, setting_value jsonb NOT NULL DEFAULT '{}',
  updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, setting_key)
);
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  title varchar(200) NOT NULL, message text NOT NULL, notification_type varchar(40) NOT NULL DEFAULT 'general',
  resource_type varchar(40), resource_id uuid, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications(user_id, read_at, created_at DESC);

