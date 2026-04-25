-- Add last_activity for sorting by recent activity
ALTER TABLE clients ADD COLUMN last_activity DATETIME;

-- Auto-set in_contact=1 for clients with any conversation, order, or product
UPDATE clients SET in_contact = 1 WHERE id IN (
  SELECT client_id FROM client_conversations
  UNION
  SELECT client_id FROM client_orders
  UNION
  SELECT client_id FROM client_purchases
);

-- Backfill last_activity from most recent conversation/order/purchase
UPDATE clients SET last_activity = (
  SELECT MAX(ts) FROM (
    SELECT created_at as ts FROM client_conversations WHERE client_id = clients.id
    UNION ALL
    SELECT created_at FROM client_orders WHERE client_id = clients.id
    UNION ALL
    SELECT created_at FROM client_purchases WHERE client_id = clients.id
  )
) WHERE id IN (SELECT id FROM clients);
