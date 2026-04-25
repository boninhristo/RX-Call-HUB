-- Оборот по клиент (импорт от Excel колона Turnover след company; произволен текст).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS turnover text;
