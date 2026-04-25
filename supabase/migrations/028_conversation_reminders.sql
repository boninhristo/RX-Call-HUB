-- Напомняния към разговори (дата/час, DONE, собственик за брояч по служител).

CREATE TABLE IF NOT EXISTS conversation_reminders (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  conversation_id integer NOT NULL REFERENCES client_conversations(id) ON DELETE CASCADE,
  remind_at timestamptz NOT NULL,
  done_at timestamptz,
  /** NULL = създаден от админ (PIN); иначе id на staff_users */
  owner_staff_user_id integer REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_reminders_company_remind
  ON conversation_reminders (company_id, remind_at);
CREATE INDEX IF NOT EXISTS idx_conversation_reminders_company_done
  ON conversation_reminders (company_id, done_at);
CREATE INDEX IF NOT EXISTS idx_conversation_reminders_owner
  ON conversation_reminders (company_id, owner_staff_user_id)
  WHERE done_at IS NULL;

ALTER TABLE conversation_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_all_anon" ON conversation_reminders;
CREATE POLICY "app_all_anon" ON conversation_reminders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
