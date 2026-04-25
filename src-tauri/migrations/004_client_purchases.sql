CREATE TABLE IF NOT EXISTS client_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    purchase_date TEXT NOT NULL,
    brand TEXT,
    model TEXT,
    value REAL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);
