-- Клиентска видимост по служител + soft delete журнал.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS visibility_scope text NOT NULL DEFAULT 'admin_only',
  ADD COLUMN IF NOT EXISTS visible_to_staff_user_id integer REFERENCES staff_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_staff_user_id integer REFERENCES staff_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by_role text,
  ADD COLUMN IF NOT EXISTS deleted_by_staff_user_id integer REFERENCES staff_users(id) ON DELETE SET NULL;

ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_visibility_scope_check;
ALTER TABLE clients
  ADD CONSTRAINT clients_visibility_scope_check
  CHECK (visibility_scope IN ('everyone', 'admin_only', 'staff_only'));

ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_deleted_by_role_check;
ALTER TABLE clients
  ADD CONSTRAINT clients_deleted_by_role_check
  CHECK (deleted_by_role IS NULL OR deleted_by_role IN ('admin', 'clients'));

CREATE INDEX IF NOT EXISTS idx_clients_company_visibility
  ON clients (company_id, visibility_scope, visible_to_staff_user_id);
CREATE INDEX IF NOT EXISTS idx_clients_company_deleted
  ON clients (company_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_clients_created_by_staff
  ON clients (created_by_staff_user_id);

