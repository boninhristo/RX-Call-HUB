-- След импорт от SQLite с запазени id — пусни веднъж в SQL Editor.
-- Иначе следващите нови записи може да получат грешен id.

DO $$
DECLARE
  t text;
  seq text;
  mx bigint;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'companies', 'company_admin_pin_alternates',
    'clients', 'client_custom_fields', 'client_conversations', 'client_orders', 'client_purchases',
    'client_meetings', 'client_activity_events', 'staff_users',
    'suppliers', 'supplier_custom_fields', 'supplier_orders', 'supplier_products',
    'competitors', 'competitor_products',
    'transport_suppliers', 'transport_supplier_history'
  ])
  LOOP
    seq := pg_get_serial_sequence(t, 'id');
    IF seq IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT MAX(id) FROM %I', t) INTO mx;
    IF mx IS NULL THEN
      PERFORM setval(seq, 1, false);
    ELSE
      PERFORM setval(seq, mx, true);
    END IF;
  END LOOP;
END $$;
