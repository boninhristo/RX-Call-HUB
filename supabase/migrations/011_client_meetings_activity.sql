-- Срещи с клиенти + лог за статистика (пусни в Supabase SQL Editor ако вече имаш schema.sql)

CREATE TABLE IF NOT EXISTS client_meetings (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  outcome_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_activity_events (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL CHECK (event_type IN ('contact', 'conversation', 'meeting')),
  ref_id integer
);

CREATE INDEX IF NOT EXISTS idx_activity_events_occurred ON client_activity_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_client ON client_activity_events (client_id);
CREATE INDEX IF NOT EXISTS idx_meetings_client ON client_meetings (client_id);

ALTER TABLE client_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_all_anon" ON client_meetings;
CREATE POLICY "app_all_anon" ON client_meetings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "app_all_anon" ON client_activity_events;
CREATE POLICY "app_all_anon" ON client_activity_events FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
