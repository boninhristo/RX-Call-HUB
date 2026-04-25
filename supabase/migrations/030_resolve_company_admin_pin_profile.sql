-- Връща дали PIN е валиден и дали е основен или алтернативен (с етикет за UI/статистика).

CREATE OR REPLACE FUNCTION public.resolve_company_admin_pin_profile (p_company_id integer, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  h text;
  p text;
  ar record;
BEGIN
  p := trim(coalesce(p_pin, ''));
  IF length(p) <> 6 OR p !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_format');
  END IF;

  SELECT c.admin_pin_hash
  INTO h
  FROM public.companies c
  WHERE c.id = p_company_id;
  IF h IS NOT NULL AND extensions.crypt(p, h) = h THEN
    RETURN jsonb_build_object('ok', true, 'kind', 'main');
  END IF;

  FOR ar IN
  SELECT a.label, a.pin_hash
  FROM public.company_admin_pin_alternates a
  WHERE a.company_id = p_company_id
  LOOP
    IF extensions.crypt(p, ar.pin_hash) = ar.pin_hash THEN
      RETURN jsonb_build_object('ok', true, 'kind', 'alternate', 'label', ar.label);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', false, 'reason', 'no_match');
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_company_admin_pin_profile (integer, text) TO anon, authenticated;
