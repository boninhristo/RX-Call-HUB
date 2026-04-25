-- Clients
CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    eik TEXT,
    vat_number TEXT,
    contact_person TEXT,
    bank_account TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Client custom fields
CREATE TABLE IF NOT EXISTS client_custom_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    field_name TEXT NOT NULL,
    field_value TEXT,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    UNIQUE(client_id, field_name)
);

-- Client conversations
CREATE TABLE IF NOT EXISTS client_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    date DATETIME NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('phone', 'in_person')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

-- Client orders (full tracking)
CREATE TABLE IF NOT EXISTS client_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'shipped', 'delivered')),
    amount REAL,
    payment_date TEXT,
    description TEXT,
    documents TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    eik TEXT,
    vat_number TEXT,
    contact_person TEXT,
    bank_account TEXT,
    website TEXT,
    offers TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Supplier custom fields
CREATE TABLE IF NOT EXISTS supplier_custom_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    field_name TEXT NOT NULL,
    field_value TEXT,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
    UNIQUE(supplier_id, field_name)
);

-- Supplier orders (simple list)
CREATE TABLE IF NOT EXISTS supplier_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    description TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
);

-- Competitors
CREATE TABLE IF NOT EXISTS competitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    website TEXT,
    contacts TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Competitor products
CREATE TABLE IF NOT EXISTS competitor_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competitor_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    brand TEXT,
    model TEXT,
    parameters TEXT,
    price TEXT,
    link TEXT,
    photo_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE
);

-- Settings (for backup config etc)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- FTS5 virtual tables for fulltext search
CREATE VIRTUAL TABLE IF NOT EXISTS clients_fts USING fts5(
    name, company, phone, email, address, notes,
    content='clients',
    content_rowid='id'
);

CREATE VIRTUAL TABLE IF NOT EXISTS suppliers_fts USING fts5(
    name, company, phone, email, website, offers, notes,
    content='suppliers',
    content_rowid='id'
);

CREATE VIRTUAL TABLE IF NOT EXISTS competitors_fts USING fts5(
    name, website, contacts, notes,
    content='competitors',
    content_rowid='id'
);

-- Triggers to keep FTS in sync with main tables
CREATE TRIGGER IF NOT EXISTS clients_ai AFTER INSERT ON clients BEGIN
    INSERT INTO clients_fts(rowid, name, company, phone, email, address, notes)
    VALUES (new.id, new.name, new.company, new.phone, new.email, new.address, new.notes);
END;
CREATE TRIGGER IF NOT EXISTS clients_ad AFTER DELETE ON clients BEGIN
    INSERT INTO clients_fts(clients_fts, rowid, name, company, phone, email, address, notes)
    VALUES ('delete', old.id, old.name, old.company, old.phone, old.email, old.address, old.notes);
END;
CREATE TRIGGER IF NOT EXISTS clients_au AFTER UPDATE ON clients BEGIN
    INSERT INTO clients_fts(clients_fts, rowid, name, company, phone, email, address, notes)
    VALUES ('delete', old.id, old.name, old.company, old.phone, old.email, old.address, old.notes);
    INSERT INTO clients_fts(rowid, name, company, phone, email, address, notes)
    VALUES (new.id, new.name, new.company, new.phone, new.email, new.address, new.notes);
END;

CREATE TRIGGER IF NOT EXISTS suppliers_ai AFTER INSERT ON suppliers BEGIN
    INSERT INTO suppliers_fts(rowid, name, company, phone, email, website, offers, notes)
    VALUES (new.id, new.name, new.company, new.phone, new.email, new.website, new.offers, new.notes);
END;
CREATE TRIGGER IF NOT EXISTS suppliers_ad AFTER DELETE ON suppliers BEGIN
    INSERT INTO suppliers_fts(suppliers_fts, rowid, name, company, phone, email, website, offers, notes)
    VALUES ('delete', old.id, old.name, old.company, old.phone, old.email, old.website, old.offers, old.notes);
END;
CREATE TRIGGER IF NOT EXISTS suppliers_au AFTER UPDATE ON suppliers BEGIN
    INSERT INTO suppliers_fts(suppliers_fts, rowid, name, company, phone, email, website, offers, notes)
    VALUES ('delete', old.id, old.name, old.company, old.phone, old.email, old.website, old.offers, old.notes);
    INSERT INTO suppliers_fts(rowid, name, company, phone, email, website, offers, notes)
    VALUES (new.id, new.name, new.company, new.phone, new.email, new.website, new.offers, new.notes);
END;

CREATE TRIGGER IF NOT EXISTS competitors_ai AFTER INSERT ON competitors BEGIN
    INSERT INTO competitors_fts(rowid, name, website, contacts, notes)
    VALUES (new.id, new.name, new.website, new.contacts, new.notes);
END;
CREATE TRIGGER IF NOT EXISTS competitors_ad AFTER DELETE ON competitors BEGIN
    INSERT INTO competitors_fts(competitors_fts, rowid, name, website, contacts, notes)
    VALUES ('delete', old.id, old.name, old.website, old.contacts, old.notes);
END;
CREATE TRIGGER IF NOT EXISTS competitors_au AFTER UPDATE ON competitors BEGIN
    INSERT INTO competitors_fts(competitors_fts, rowid, name, website, contacts, notes)
    VALUES ('delete', old.id, old.name, old.website, old.contacts, old.notes);
    INSERT INTO competitors_fts(rowid, name, website, contacts, notes)
    VALUES (new.id, new.name, new.website, new.contacts, new.notes);
END;
