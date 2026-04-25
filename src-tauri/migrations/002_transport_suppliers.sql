-- Transport suppliers (logistics companies)
CREATE TABLE IF NOT EXISTS transport_suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    phone TEXT,
    contact_person TEXT,
    notes TEXT,
    comment TEXT,
    sea_freight_usd REAL,
    land_transport_eur REAL,
    other_eur REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Transport history (what we've done with them)
CREATE TABLE IF NOT EXISTS transport_supplier_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transport_supplier_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    description TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transport_supplier_id) REFERENCES transport_suppliers(id) ON DELETE CASCADE
);
