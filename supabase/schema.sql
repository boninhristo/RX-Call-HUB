-- Klienti — изпълни целия скрипт в Supabase: SQL Editor → New query → Run
-- След това в Project Settings → API копирай URL и anon public key в .env
-- Multi-tenant (фирми Bautrax / Astralis и company_id): изпълни migrations/017_companies_multitenant.sql

-- Таблици (PostgreSQL)

CREATE OR REPLACE FUNCTION public.klienti_parse_turnover_numeric(raw text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  s text;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;
  s := btrim(raw);
  s := replace(s, ' ', '');
  s := replace(s, ',', '.');
  BEGIN
    RETURN s::numeric;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN NULL;
  END;
END;
$$;

CREATE TABLE IF NOT EXISTS clients (
  id serial PRIMARY KEY,
  name text NOT NULL,
  company text,
  turnover text,
  phone text,
  email text,
  address text,
  address_sort text GENERATED ALWAYS AS (NULLIF(TRIM(COALESCE(address, '')), '')) STORED,
  turnover_sort numeric GENERATED ALWAYS AS (public.klienti_parse_turnover_numeric(turnover)) STORED,
  eik text,
  vat_number text,
  contact_person text,
  bank_account text,
  notes text,
  in_contact integer NOT NULL DEFAULT 0,
  last_activity timestamptz,
  visibility_scope text NOT NULL DEFAULT 'admin_only' CHECK (visibility_scope IN ('everyone', 'admin_only', 'staff_only')),
  visible_to_staff_user_id integer,
  created_by_staff_user_id integer,
  deleted_at timestamptz,
  deleted_by_role text CHECK (deleted_by_role IS NULL OR deleted_by_role IN ('admin', 'clients')),
  deleted_by_staff_user_id integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_custom_fields (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  field_value text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (client_id, field_name)
);

CREATE TABLE IF NOT EXISTS client_conversations (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date timestamptz NOT NULL,
  type text NOT NULL CHECK (type IN ('phone', 'in_person')),
  notes text,
  script_id integer,
  machine_catalog_item_id integer,
  machine_type text,
  script_answers jsonb,
  script_snapshot jsonb,
  machine_snapshot jsonb,
  selling_points_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_reminders (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  conversation_id integer NOT NULL REFERENCES client_conversations(id) ON DELETE CASCADE,
  remind_at timestamptz NOT NULL,
  done_at timestamptz,
  owner_staff_user_id integer REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_reminders_company_remind
  ON conversation_reminders (company_id, remind_at);
CREATE INDEX IF NOT EXISTS idx_conversation_reminders_company_done
  ON conversation_reminders (company_id, done_at);

CREATE TABLE IF NOT EXISTS client_orders (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered')),
  amount double precision,
  payment_date text,
  description text,
  documents text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_purchases (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  purchase_date text NOT NULL,
  brand text,
  model text,
  value double precision,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id serial PRIMARY KEY,
  name text NOT NULL,
  company text,
  phone text,
  email text,
  address text,
  eik text,
  vat_number text,
  contact_person text,
  bank_account text,
  website text,
  offers text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_custom_fields (
  id serial PRIMARY KEY,
  supplier_id integer NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  field_value text,
  UNIQUE (supplier_id, field_name)
);

CREATE TABLE IF NOT EXISTS supplier_orders (
  id serial PRIMARY KEY,
  supplier_id integer NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  date text NOT NULL,
  description text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_products (
  id serial PRIMARY KEY,
  supplier_id integer NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name text NOT NULL,
  brand text,
  model text,
  parameters text,
  price text,
  link text,
  photo_path text,
  technical_info text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS competitors (
  id serial PRIMARY KEY,
  name text NOT NULL,
  website text,
  contacts text,
  address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS competitor_products (
  id serial PRIMARY KEY,
  competitor_id integer NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  name text NOT NULL,
  brand text,
  model text,
  parameters text,
  price text,
  link text,
  photo_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transport_suppliers (
  id serial PRIMARY KEY,
  company_name text NOT NULL,
  phone text,
  email text,
  contact_person text,
  notes text,
  comment text,
  sea_freight_usd double precision,
  land_transport_eur double precision,
  other_eur double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transport_supplier_history (
  id serial PRIMARY KEY,
  transport_supplier_id integer NOT NULL REFERENCES transport_suppliers(id) ON DELETE CASCADE,
  date text NOT NULL,
  description text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value text
);

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

CREATE TABLE IF NOT EXISTS conversation_scripts (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  script_code text NOT NULL,
  name text NOT NULL,
  machine_type text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, script_code)
);

CREATE TABLE IF NOT EXISTS conversation_script_steps (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  script_id integer NOT NULL REFERENCES conversation_scripts(id) ON DELETE CASCADE,
  step_no integer NOT NULL,
  step_type text NOT NULL DEFAULT 'question',
  question text NOT NULL,
  answer_type text NOT NULL DEFAULT 'text',
  required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (script_id, step_no)
);

CREATE TABLE IF NOT EXISTS machine_catalog_items (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  machine_code text NOT NULL,
  machine_type text NOT NULL,
  model_name text NOT NULL,
  price_eur double precision,
  specs text,
  features text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, machine_code)
);

CREATE TABLE IF NOT EXISTS machine_selling_points (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  machine_type text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  text text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_meetings (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  meeting_address text,
  contact_person text,
  phone text,
  outcome_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_activity_events (
  id serial PRIMARY KEY,
  client_id integer,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL CHECK (event_type IN (
    'contact', 'conversation', 'meeting', 'order', 'client_created',
    'conversation_deleted', 'meeting_deleted', 'order_deleted', 'client_deleted'
  )),
  ref_id integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  actor_user_id integer REFERENCES staff_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_events_occurred ON client_activity_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_client ON client_activity_events (client_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_actor ON client_activity_events (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_meetings_client ON client_meetings (client_id);

-- Row Level Security: достъп с anon key (десктоп приложение)
-- За по-строга сигурност по-късно: Supabase Auth + политики по user id

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_supplier_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_reminders ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'clients', 'client_custom_fields', 'client_conversations', 'conversation_reminders', 'client_orders', 'client_purchases',
    'client_meetings', 'client_activity_events', 'staff_users',
    'suppliers', 'supplier_custom_fields', 'supplier_orders', 'supplier_products',
    'competitors', 'competitor_products',
    'transport_suppliers', 'transport_supplier_history', 'settings'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "app_all_anon" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "app_all_anon" ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;
