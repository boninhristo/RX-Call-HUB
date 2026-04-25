-- Адрес на срещата, лице за контакт, телефон (над полето за резултат от срещата в UI)
ALTER TABLE client_meetings
  ADD COLUMN IF NOT EXISTS meeting_address text,
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS phone text;
