-- Статистика: създаден клиент като отделно събитие
ALTER TABLE client_activity_events DROP CONSTRAINT IF EXISTS client_activity_events_event_type_check;
ALTER TABLE client_activity_events
  ADD CONSTRAINT client_activity_events_event_type_check
  CHECK (event_type IN (
    'contact', 'conversation', 'meeting', 'order', 'client_created',
    'conversation_deleted', 'meeting_deleted', 'order_deleted', 'client_deleted'
  ));
