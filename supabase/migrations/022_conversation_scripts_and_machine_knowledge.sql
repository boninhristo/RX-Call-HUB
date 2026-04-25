-- Conversation scripts + machine knowledge base + metadata in conversations.

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

CREATE INDEX IF NOT EXISTS idx_conv_scripts_company_machine
  ON conversation_scripts (company_id, machine_type, is_active);

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

CREATE INDEX IF NOT EXISTS idx_conv_script_steps_script
  ON conversation_script_steps (script_id, step_no);

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

CREATE INDEX IF NOT EXISTS idx_machine_catalog_company_type
  ON machine_catalog_items (company_id, machine_type, is_active);

CREATE TABLE IF NOT EXISTS machine_selling_points (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  machine_type text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  text text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_machine_selling_points_company_type
  ON machine_selling_points (company_id, machine_type, is_active, priority);

ALTER TABLE client_conversations
  ADD COLUMN IF NOT EXISTS script_id integer REFERENCES conversation_scripts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS machine_catalog_item_id integer REFERENCES machine_catalog_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS machine_type text,
  ADD COLUMN IF NOT EXISTS script_answers jsonb,
  ADD COLUMN IF NOT EXISTS script_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS machine_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS selling_points_snapshot jsonb;

