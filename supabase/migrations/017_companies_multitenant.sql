-- Multi-tenant: фирми, company_id на всички данни, RPC за код и админ PIN.
-- Съществуващите редове се приписват на Bautrax. Astralis е празна фирма.
-- Стар админ PIN (Bautrax): непроменен — същият bcrypt като в предишната версия на приложението.
-- Нов админ PIN за Astralis: 882199 (сменете след първи вход при нужда).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS companies (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  admin_pin_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companies_code_lower ON companies (lower(code));

-- Bautrax: същият хеш като в src-tauri (старата единствена фирма); код за вход: BTX2026
INSERT INTO companies (code, name, admin_pin_hash)
VALUES (
  'BTX2026',
  'Bautrax',
  '$2b$10$IaT6kW5It8D3Tx4VbNHyBuT3p1MaExoDx7xfobnBfYVbeIfbJA7w2'
);

-- Astralis: начален PIN 882199; код за вход: ast
INSERT INTO companies (code, name, admin_pin_hash)
VALUES (
  'ast',
  'Astralis',
  crypt('882199', gen_salt('bf'))
);

-- company_id на всички бизнес таблици
ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id);
ALTER TABLE client_custom_fields ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id);
ALTER TABLE client_conversations ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id);
ALTER TABLE client_orders ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id);
ALTER TABLE client_purchases ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id);
ALTER TABLE client_meetings ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id);
ALTER TABLE client_activity_events ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id);
ALTER TABLE supplier_custom_fields ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id);
ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id);
ALTER TABLE supplier_products ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id);
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id);
ALTER TABLE competitor_products ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id);
ALTER TABLE transport_suppliers ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id);
ALTER TABLE transport_supplier_history ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id);
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id);

UPDATE clients SET company_id = (SELECT id FROM companies WHERE code = 'BTX2026' LIMIT 1) WHERE company_id IS NULL;
UPDATE client_custom_fields SET company_id = (SELECT id FROM companies WHERE code = 'BTX2026' LIMIT 1) WHERE company_id IS NULL;
UPDATE client_conversations SET company_id = (SELECT id FROM companies WHERE code = 'BTX2026' LIMIT 1) WHERE company_id IS NULL;
UPDATE client_orders SET company_id = (SELECT id FROM companies WHERE code = 'BTX2026' LIMIT 1) WHERE company_id IS NULL;
UPDATE client_purchases SET company_id = (SELECT id FROM companies WHERE code = 'BTX2026' LIMIT 1) WHERE company_id IS NULL;
UPDATE client_meetings SET company_id = (SELECT id FROM companies WHERE code = 'BTX2026' LIMIT 1) WHERE company_id IS NULL;
UPDATE client_activity_events SET company_id = (SELECT id FROM companies WHERE code = 'BTX2026' LIMIT 1) WHERE company_id IS NULL;
UPDATE suppliers SET company_id = (SELECT id FROM companies WHERE code = 'BTX2026' LIMIT 1) WHERE company_id IS NULL;
UPDATE supplier_custom_fields SET company_id = (SELECT id FROM companies WHERE code = 'BTX2026' LIMIT 1) WHERE company_id IS NULL;
UPDATE supplier_orders SET company_id = (SELECT id FROM companies WHERE code = 'BTX2026' LIMIT 1) WHERE company_id IS NULL;
UPDATE supplier_products SET company_id = (SELECT id FROM companies WHERE code = 'BTX2026' LIMIT 1) WHERE company_id IS NULL;
UPDATE competitors SET company_id = (SELECT id FROM companies WHERE code = 'BTX2026' LIMIT 1) WHERE company_id IS NULL;
UPDATE competitor_products SET company_id = (SELECT id FROM companies WHERE code = 'BTX2026' LIMIT 1) WHERE company_id IS NULL;
UPDATE transport_suppliers SET company_id = (SELECT id FROM companies WHERE code = 'BTX2026' LIMIT 1) WHERE company_id IS NULL;
UPDATE transport_supplier_history SET company_id = (SELECT id FROM companies WHERE code = 'BTX2026' LIMIT 1) WHERE company_id IS NULL;
UPDATE settings SET company_id = (SELECT id FROM companies WHERE code = 'BTX2026' LIMIT 1) WHERE company_id IS NULL;
UPDATE staff_users SET company_id = (SELECT id FROM companies WHERE code = 'BTX2026' LIMIT 1) WHERE company_id IS NULL;

ALTER TABLE clients ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE client_custom_fields ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE client_conversations ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE client_orders ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE client_purchases ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE client_meetings ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE client_activity_events ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE suppliers ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE supplier_custom_fields ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE supplier_orders ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE supplier_products ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE competitors ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE competitor_products ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE transport_suppliers ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE transport_supplier_history ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE settings ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE staff_users ALTER COLUMN company_id SET NOT NULL;

-- staff_users: уникално потребителско име в рамките на фирмата
ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_username_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_users_company_username ON staff_users (company_id, lower(username));

-- settings: съставен ключ (company_id, key)
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE settings ADD CONSTRAINT settings_pkey PRIMARY KEY (company_id, key);

CREATE INDEX IF NOT EXISTS idx_clients_company ON clients (company_id);
CREATE INDEX IF NOT EXISTS idx_staff_company ON staff_users (company_id);
CREATE INDEX IF NOT EXISTS idx_activity_company ON client_activity_events (company_id);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies_no_direct" ON companies FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.lookup_company_by_code(p_code text)
RETURNS TABLE(id integer, name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name
  FROM companies c
  WHERE lower(trim(p_code)) = lower(c.code)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.verify_company_admin_pin(p_company_id integer, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h text;
  p text;
BEGIN
  p := trim(coalesce(p_pin, ''));
  IF length(p) <> 6 OR p !~ '^[0-9]{6}$' THEN
    RETURN false;
  END IF;
  SELECT c.admin_pin_hash INTO h FROM companies c WHERE c.id = p_company_id;
  IF h IS NULL THEN
    RETURN false;
  END IF;
  RETURN crypt(p, h) = h;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_company_by_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_company_admin_pin(integer, text) TO anon, authenticated;
