-- Fix RLS for newly added script/knowledge tables.
-- Needed because the app uses anon/authenticated clients directly.

ALTER TABLE conversation_scripts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_all_anon" ON conversation_scripts;
CREATE POLICY "app_all_anon"
  ON conversation_scripts
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE conversation_script_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_all_anon" ON conversation_script_steps;
CREATE POLICY "app_all_anon"
  ON conversation_script_steps
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE machine_catalog_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_all_anon" ON machine_catalog_items;
CREATE POLICY "app_all_anon"
  ON machine_catalog_items
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE machine_selling_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_all_anon" ON machine_selling_points;
CREATE POLICY "app_all_anon"
  ON machine_selling_points
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

