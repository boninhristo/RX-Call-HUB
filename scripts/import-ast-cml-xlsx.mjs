/**
 * Пълен импорт на клиенти от .xlsx в Astralis (ast): всички стандартни полета,
 * in_contact=0, visibility admin_only, без пропускане на непознати колони
 * (добавя се в notes / client_custom_fields).
 *
 *   node scripts/import-ast-cml-xlsx.mjs "C:\path\СИ ЕМ ЕЛ.xlsx"
 *   node scripts/import-ast-cml-xlsx.mjs "..." --code ast
 */

import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import dotenv from "dotenv";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

dotenv.config({ path: path.join(root, ".env") });

const url = process.env.VITE_SUPABASE_URL?.trim();
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY?.trim();

const STD_FIELDS = [
  "name",
  "company",
  "turnover",
  "phone",
  "email",
  "address",
  "eik",
  "vat_number",
  "contact_person",
  "bank_account",
  "notes",
];

/**
 * @param {unknown} v
 * @returns {string | null}
 */
function cellToText(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    if (Math.abs(v) >= 1e15) return String(v);
    if (Number.isInteger(v) || (v === Math.trunc(v) && Math.abs(v) < 1e12)) {
      if (String(v).includes("e") || String(v).includes("E")) return v.toFixed(0);
      return String(v);
    }
    const t = v.toString();
    if (t.includes("e") || t.includes("E")) {
      return v.toLocaleString("en-US", { useGrouping: false, maximumSignificantDigits: 21 });
    }
    return t;
  }
  if (v instanceof Date) {
    return v.toISOString();
  }
  const s = String(v)
    .replace(/\0/g, "")
    .trim();
  return s.length ? s : null;
}

/**
 * @param {string} raw
 * @returns {string | null}
 */
function headerToField(raw) {
  const k = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .normalize("NFC");
  const map = {
    name: "name",
    "име": "name",
    company: "company",
    "фирма": "company",
    turnover: "turnover",
    оборот: "turnover",
    phone: "phone",
    "телефон": "phone",
    "tel": "phone",
    "mobile": "phone",
    email: "email",
    "e-mail": "email",
    "поща": "email",
    address: "address",
    "адрес": "address",
    eik: "eik",
    "еик": "eik",
    vat: "vat_number",
    "ддс": "vat_number",
    "vat number": "vat_number",
    vat_number: "vat_number",
    "contact person": "contact_person",
    contact_person: "contact_person",
    "мол / контакт": "contact_person",
    "лице": "contact_person",
    "bank account": "bank_account",
    bank_account: "bank_account",
    "сметка": "bank_account",
    iban: "bank_account",
    notes: "notes",
    "забележка": "notes",
    "коментар": "notes",
    "банка / сметка": "bank_account",
  };
  if (map[k] != null) return map[k];
  return null;
}

/**
 * @param {unknown} row
 * @param {number} len
 * @param {number} c
 * @returns {string | null}
 */
function getCell(row, len, c) {
  if (c < 0 || c >= len) return null;
  return cellToText(row[c]);
}

function parseArgs(argv) {
  let filePath = null;
  let companyCode = "ast";
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--code" && argv[i + 1]) companyCode = argv[++i];
    else if (a === "--dry-run") continue;
    else if (!a.startsWith("-") && !filePath) filePath = a;
  }
  return { filePath, companyCode, dry: argv.includes("--dry-run") };
}

async function main() {
  const { filePath, companyCode, dry } = parseArgs(process.argv);
  if (!url || !key) {
    console.error("Липсва .env с VITE_SUPABASE_URL и publishable/anon ключ.");
    process.exit(1);
  }
  if (!filePath) {
    console.error(
      'Подай път към .xlsx, напр. node scripts/import-ast-cml-xlsx.mjs "C:\\...\\файл.xlsx"'
    );
    process.exit(1);
  }
  const resolved = path.resolve(filePath);
  if (!existsSync(resolved)) {
    console.error("Файлът не съществува:", resolved);
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const { data: compRows, error: rpcErr } = await supabase.rpc("lookup_company_by_code", {
    p_code: companyCode,
  });
  if (rpcErr) {
    console.error("lookup_company_by_code:", rpcErr.message);
    process.exit(1);
  }
  if (!compRows?.length) {
    console.error(`Няма фирма с код: ${companyCode}`);
    process.exit(1);
  }
  const companyId = compRows[0].id;
  const companyName = compRows[0].name;
  console.log("Файл:", resolved);
  console.log("Фирма:", companyName, `(id=${companyId}, code=${companyCode})`);

  const wb = XLSX.readFile(resolved);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (matrix.length < 2) {
    console.error("Няма данни след заглавния ред.");
    process.exit(1);
  }

  const rawHeader = matrix[0].map((h) => String(h ?? "").replace(/\s+/g, " ").trim());

  /** @type {Record<string, number|undefined>} */
  const firstColByField = {};
  const duplicateCols = [];
  const unknownHeaderCols = [];
  for (let c = 0; c < rawHeader.length; c++) {
    const f = headerToField(rawHeader[c] || `Column${c + 1}`);
    if (f) {
      if (firstColByField[f] === undefined) {
        firstColByField[f] = c;
      } else {
        duplicateCols.push({ c, h: rawHeader[c] || f, f });
      }
    } else {
      unknownHeaderCols.push({ c, h: rawHeader[c] || `Col${c + 1}` });
    }
  }

  const nameCol = firstColByField["name"];
  if (nameCol === undefined) {
    console.error("Няма колона name/име — провери първия ред.");
    process.exit(1);
  }

  const importRows = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    const n = getCell(row, row.length, nameCol);
    if (!n) continue;
    const std = {
      name: n,
      company: null,
      turnover: null,
      phone: null,
      email: null,
      address: null,
      eik: null,
      vat_number: null,
      contact_person: null,
      bank_account: null,
      notes: null,
    };
    const extras = [];
    for (const k of STD_FIELDS) {
      if (k === "name") continue;
      const ci = firstColByField[k];
      if (ci === undefined) continue;
      const val = getCell(row, row.length, ci);
      if (val != null) std[k] = val;
    }
    for (const d of duplicateCols) {
      const val = getCell(row, row.length, d.c);
      if (val == null) continue;
      extras.push([d.h || d.f, val]);
    }
    for (const u of unknownHeaderCols) {
      const val = getCell(row, row.length, u.c);
      if (val == null) continue;
      extras.push([u.h, val]);
    }
    if (extras.length) {
      const part = extras.map(([a, b]) => `${a}: ${b}`.replace(/\n/g, " ")).join("\n");
      std.notes = std.notes ? `${std.notes}\n\n[Доп. полета]\n${part}` : `[Доп. полета]\n${part}`;
    }
    importRows.push(std);
  }

  if (duplicateCols.length) {
    console.log(
      "Дублирани колони (2-ра+ в notes):",
      duplicateCols.map((d) => d.h).join(", ")
    );
  }
  if (unknownHeaderCols.length) {
    console.log("Непознати заглавия → notes:", unknownHeaderCols.map((u) => u.h).join(", "));
  }
  console.log("Валидни редове за вмъкване:", importRows.length);
  if (dry) {
    console.log("--dry-run: спираме преди insert.");
    return;
  }
  if (importRows.length === 0) {
    console.log("Нищо за вмъкване.");
    return;
  }

  const baseRow = (data) => ({
    company_id: companyId,
    in_contact: 0,
    visibility_scope: "admin_only",
    visible_to_staff_user_id: null,
    created_by_staff_user_id: null,
    name: data.name,
    company: data.company,
    turnover: data.turnover,
    phone: data.phone,
    email: data.email,
    address: data.address,
    eik: data.eik,
    vat_number: data.vat_number,
    contact_person: data.contact_person,
    bank_account: data.bank_account,
    notes: data.notes,
  });

  const batch = importRows.map(baseRow);
  let chunkSize = 200;
  let inserted = 0;
  let i = 0;
  while (i < batch.length) {
    const chunk = batch.slice(i, i + chunkSize);
    const { error } = await supabase.from("clients").insert(chunk);
    if (error) {
      if (chunkSize > 25) {
        console.warn(`Чанк ${chunkSize} не мина (${error.message}), намалявам…`);
        chunkSize = Math.max(25, Math.floor(chunkSize / 2));
        continue;
      }
      console.error(`Грешка при редове ${i + 1}–${i + chunk.length}:`, error.message);
      process.exit(1);
    }
    inserted += chunk.length;
    i += chunkSize;
    if (inserted % 500 === 0 || inserted === batch.length) {
      console.log("  вмъкнати:", inserted);
    }
  }

  console.log("Готово. Общо вмъкнати:", inserted);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
