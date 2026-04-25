/**
 * Еднократно прехвърляне от локален SQLite (klienti.db) към Supabase.
 *
 * Употреба (от папката c:\dev\klienti):
 *   npm run migrate
 *
 * Или с път до файла:
 *   npm run migrate -- "C:\Users\...\AppData\Roaming\com.rentex.klienti\klienti.db"
 */

import { createClient } from "@supabase/supabase-js";
import initSqlJs from "sql.js";
import dotenv from "dotenv";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

dotenv.config({ path: path.join(root, ".env") });

const url = process.env.VITE_SUPABASE_URL?.trim();
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!url || !key) {
  console.error("Липсва .env с VITE_SUPABASE_URL и publishable или anon ключ.");
  process.exit(1);
}

const supabase = createClient(url, key);

function defaultSqlitePath() {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "com.rentex.klienti", "klienti.db");
}

function queryAll(db, sql) {
  const res = db.exec(sql);
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
}

function tableExists(db, name) {
  const r = queryAll(
    db,
    `SELECT name FROM sqlite_master WHERE type='table' AND name=${JSON.stringify(name)}`
  );
  return r.length > 0;
}

/** Ред на вмъкване (родители преди деца) */
const TABLES = [
  "clients",
  "suppliers",
  "competitors",
  "transport_suppliers",
  "client_custom_fields",
  "client_conversations",
  "client_orders",
  "client_purchases",
  "supplier_custom_fields",
  "supplier_orders",
  "supplier_products",
  "competitor_products",
  "transport_supplier_history",
  "settings",
];

async function insertTable(table, rows) {
  if (rows.length === 0) {
    console.log(`  ${table}: 0 реда (пропуск)`);
    return;
  }
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }
  }
  console.log(`  ${table}: ${rows.length} реда`);
}

async function main() {
  const argPath = process.argv[2];
  const dbPath = argPath ? path.resolve(argPath) : defaultSqlitePath();

  if (!existsSync(dbPath)) {
    console.error(`Не намирам SQLite файл:\n  ${dbPath}\n`);
    console.error("Копирай пътя до klienti.db и подай го така:");
    console.error('  npm run migrate -- "C:\\...\\klienti.db"');
    process.exit(1);
  }

  console.log("Чета:", dbPath);

  const wasmPath = path.join(root, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(root, "node_modules", "sql.js", "dist", file),
  });
  const fileBuffer = readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);

  let total = 0;
  for (const table of TABLES) {
    if (!tableExists(db, table)) {
      console.log(`  ${table}: няма таблица в SQLite (пропуск)`);
      continue;
    }
    const rows = queryAll(db, `SELECT * FROM ${table}`);
    await insertTable(table, rows);
    total += rows.length;
  }

  db.close();
  console.log("\nГотово. Общо записани редове:", total);
  console.log("\n>>> ВАЖНО: Пусни в Supabase → SQL Editor файла:");
  console.log("    supabase/reset_sequences_after_migration.sql");
  console.log("    (това оправя авто-номерацията за нови записи.)\n");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
