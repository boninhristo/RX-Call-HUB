-- Сортиране по оборот като число (а не лексикографски по текст).
-- turnover остава text за импорт; turnover_sort става numeric за ORDER BY.

DROP INDEX IF EXISTS idx_clients_company_turnover_sort;

ALTER TABLE clients DROP COLUMN IF EXISTS turnover_sort;

CREATE OR REPLACE FUNCTION public.klienti_parse_turnover_numeric(raw text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  s text;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;
  s := btrim(raw);
  -- хилядни разделители (интервал), десетична запетая → точка
  s := replace(s, ' ', '');
  s := replace(s, ',', '.');
  BEGIN
    RETURN s::numeric;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN NULL;
  END;
END;
$$;

ALTER TABLE clients
  ADD COLUMN turnover_sort numeric
  GENERATED ALWAYS AS (public.klienti_parse_turnover_numeric(turnover)) STORED;

CREATE INDEX IF NOT EXISTS idx_clients_company_turnover_sort ON clients (company_id, turnover_sort);
