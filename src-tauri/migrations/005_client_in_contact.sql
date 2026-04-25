-- Add in_contact flag for cold call tracking (0 = not contacted, 1 = contacted)
ALTER TABLE clients ADD COLUMN in_contact INTEGER NOT NULL DEFAULT 0;
