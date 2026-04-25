-- crypt() идва от pgcrypto. В Supabase разширението обикновено е в schema `extensions`.
-- Ако CREATE EXTENSION не мине, включи „pgcrypto“ от Dashboard → Database → Extensions.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.verify_company_admin_pin(p_company_id integer, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  h text;
  p text;
BEGIN
  p := trim(coalesce(p_pin, ''));
  IF length(p) <> 6 OR p !~ '^[0-9]{6}$' THEN
    RETURN false;
  END IF;
  SELECT c.admin_pin_hash INTO h FROM companies c WHERE c.id = p_company_id;
  IF h IS NULL THEN
    RETURN false;
  END IF;
  RETURN extensions.crypt(p, h) = h;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_company_admin_pin(integer, text) TO anon, authenticated;
