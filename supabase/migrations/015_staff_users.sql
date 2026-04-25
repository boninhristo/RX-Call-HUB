-- Служители с clients достъп: потребител + bcrypt парола (създават се от админ в Settings)
CREATE TABLE IF NOT EXISTS staff_users (
  id serial PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_users_username ON staff_users (lower(username));

ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_all_anon" ON staff_users;
CREATE POLICY "app_all_anon" ON staff_users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
