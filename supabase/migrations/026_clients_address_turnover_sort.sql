-- Сортиране: празни адрес/оборот да са в края (NULL), не в началото на страницата.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_sort text
  GENERATED ALWAYS AS (NULLIF(TRIM(COALESCE(address, '')), '')) STORED;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS turnover_sort text
  GENERATED ALWAYS AS (NULLIF(TRIM(COALESCE(turnover, '')), '')) STORED;

CREATE INDEX IF NOT EXISTS idx_clients_company_address_sort ON clients (company_id, address_sort);
CREATE INDEX IF NOT EXISTS idx_clients_company_turnover_sort ON clients (company_id, turnover_sort);
