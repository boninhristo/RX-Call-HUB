-- Трета фирма (тенант): RXG — празна база (няма клиенти, доставчици, настройки и т.н.).
-- Код за вход: RXG (lookup е case-insensitive).
-- Начален админ PIN: 736492 (сменете след първи вход: UPDATE companies SET admin_pin_hash = crypt('НОВ_PIN', gen_salt('bf')) WHERE lower(trim(code)) = 'rxg';)

INSERT INTO companies (code, name, admin_pin_hash)
SELECT
  'RXG',
  'RXG',
  crypt('736492', gen_salt('bf'))
WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE lower(trim(c.code)) = 'rxg');
