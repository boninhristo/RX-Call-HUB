-- Add created_at to client_custom_fields for timestamp tracking
ALTER TABLE client_custom_fields ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;
