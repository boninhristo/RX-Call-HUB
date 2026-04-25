-- Разширение на лога: metadata, нови типове, без CASCADE към clients (запазва се история при изтриване на клиент)

ALTER TABLE client_activity_events ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

ALTER TABLE client_activity_events DROP CONSTRAINT IF EXISTS client_activity_events_event_type_check;
ALTER TABLE client_activity_events
  ADD CONSTRAINT client_activity_events_event_type_check
  CHECK (event_type IN (
    'contact', 'conversation', 'meeting', 'order',
    'conversation_deleted', 'meeting_deleted', 'order_deleted', 'client_deleted'
  ));

-- Премахва CASCADE: събитията остават с client_id след изтриване на клиента
ALTER TABLE client_activity_events DROP CONSTRAINT IF EXISTS client_activity_events_client_id_fkey;

ALTER TABLE client_activity_events ALTER COLUMN client_id DROP NOT NULL;
