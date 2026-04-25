-- Допълнителни именувани админ PIN-ове за същата фирма (6 цифри, като основния).
-- RLS: без директен достъп от anon; проверката е през verify_company_admin_pin (SECURITY DEFINER).

CREATE TABLE IF NOT EXISTS public.company_admin_pin_alternates (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  label text NOT NULL,
  pin_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_admin_pin_alternates_label_nonempty CHECK (length(btrim(label)) > 0),
  CONSTRAINT company_admin_pin_alternates_unique_label UNIQUE (company_id, label)
);

CREATE INDEX IF NOT EXISTS idx_company_admin_pin_alternates_company
  ON public.company_admin_pin_alternates (company_id);

ALTER TABLE public.company_admin_pin_alternates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_admin_pin_alternates_no_direct"
  ON public.company_admin_pin_alternates
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- PIN за ред: 648273 — сменете при нужда: UPDATE + crypt в SQL Editor
INSERT INTO public.company_admin_pin_alternates (company_id, label, pin_hash)
SELECT c.id, 'Кирил Александров', extensions.crypt('648273', extensions.gen_salt('bf'))
FROM public.companies c
WHERE lower(trim(c.code)) = 'ast'
LIMIT 1
ON CONFLICT (company_id, label) DO NOTHING;

CREATE OR REPLACE FUNCTION public.verify_company_admin_pin (p_company_id integer, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  h text;
  p text;
  alt_h text;
BEGIN
  p := trim(coalesce(p_pin, ''));
  IF length(p) <> 6 OR p !~ '^[0-9]{6}$' THEN
    RETURN false;
  END IF;

  SELECT c.admin_pin_hash
  INTO h
  FROM public.companies c
  WHERE c.id = p_company_id;

  IF h IS NOT NULL AND extensions.crypt(p, h) = h THEN
    RETURN true;
  END IF;

  FOR alt_h IN
  SELECT a.pin_hash
  FROM public.company_admin_pin_alternates a
  WHERE a.company_id = p_company_id
  LOOP
    IF extensions.crypt(p, alt_h) = alt_h THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_company_admin_pin (integer, text) TO anon, authenticated;
