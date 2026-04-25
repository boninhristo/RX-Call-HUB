-- Нови кодове за вход: Bautrax → BTX2026, Astralis → ast (lookup е case-insensitive)
-- За вече съществуващи бази със стари кодове bautrax / astralis

UPDATE companies SET code = 'BTX2026' WHERE lower(code) = 'bautrax';
UPDATE companies SET code = 'ast' WHERE lower(code) = 'astralis';
