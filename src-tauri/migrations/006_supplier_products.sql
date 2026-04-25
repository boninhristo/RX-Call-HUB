-- Supplier products (same structure as competitor_products)
CREATE TABLE IF NOT EXISTS supplier_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    brand TEXT,
    model TEXT,
    parameters TEXT,
    price TEXT,
    link TEXT,
    photo_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
);
