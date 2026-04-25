-- Хешът за Bautrax от миграция 017 е създаден с Rust bcrypt; pgcrypto crypt() често
-- не го приема за същия PIN. Презаписваме хеша с gen_salt/crypt от PostgreSQL,
-- за да съвпада с verify_company_admin_pin.
-- PIN: 847291 (сменете с UPDATE при нужда).

UPDATE companies
SET admin_pin_hash = extensions.crypt('847291', extensions.gen_salt('bf'))
WHERE name = 'Bautrax';
