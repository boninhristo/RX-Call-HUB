-- Кой е направил записа в лога (служител); NULL = администратор (PIN) или стари записи
ALTER TABLE client_activity_events
  ADD COLUMN IF NOT EXISTS actor_user_id integer REFERENCES staff_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activity_events_actor ON client_activity_events (actor_user_id);
