/**
 * Масов импорт на клиенти от .xlsx в избран тенант (по подразбиране RXG).
 *
 * Очаква първи ред: name, company, turnover (по избор), phone, email, address, eik,
 * vat (или vat_number), contact person, bank account, notes.
 *
 * Употреба (от c:\\dev\\klienti):
 *   node scripts/import-clients-xlsx.mjs "C:\\path\\to\\file.xlsx"
 *   node scripts/import-clients-xlsx.mjs "..." --code BTX2026
 *
 * Изисква .env: VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY или VITE_SUPABASE_ANON_KEY
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
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.VITE_SUPABASE_ANON_KEY?.trim();

function cellStr(v) {
  if (v == null || v === "") return null;
  const s = String(v)
    .replace(/\0/g, "")
    .trim();
  return s.length ? s : null;
}

/** Заглавен ред от Excel → ключ в clients */
function headerToField(h) {
  const k = String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const map = {
    name: "name",
    company: "company",
    turnover: "turnover",
    оборот: "turnover",
    phone: "phone",
    email: "email",
    address: "address",
    eik: "eik",
    vat: "vat_number",
    "vat number": "vat_number",
    vat_number: "vat_number",
    "contact person": "contact_person",
    contact_person: "contact_person",
    "bank account": "bank_account",
    bank_account: "bank_account",
    notes: "notes",
  };
  return map[k] ?? null;
}

function parseArgs(argv) {
  let filePath = null;
  let companyCode = "RXG";
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--code" && argv[i + 1]) {
      companyCode = argv[++i];
    } else if (!a.startsWith("-")) {
      filePath = a;
    }
  }
  return { filePath, companyCode };
}

async function main() {
  const { filePath, companyCode } = parseArgs(process.argv);
  if (!url || !key) {
    console.error("Липсва .env с VITE_SUPABASE_URL и publishable/anon ключ.");
    process.exit(1);
  }
  if (!filePath) {
    console.error('Подай път към .xlsx файла, напр. node scripts/import-clients-xlsx.mjs "C:\\...\\file.xlsx"');
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
  const rowsRpc = compRows;
  if (!rowsRpc?.length) {
    console.error(`Няма фирма с код (вход): ${companyCode}`);
    process.exit(1);
  }
  const companyId = rowsRpc[0].id;

  console.log("Файл:", resolved);
  console.log("Фирма:", rowsRpc[0].name, `(id=${companyId}, code=${companyCode})`);

  const wb = XLSX.readFile(resolved);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (matrix.length < 2) {
    console.error("Няма данни след заглавния ред.");
    process.exit(1);
  }

  const headerRow = matrix[0].map((h) => headerToField(h));
  const colIndex = {};
  for (let c = 0; c < headerRow.length; c++) {
    const f = headerRow[c];
    if (f && colIndex[f] === undefined) colIndex[f] = c;
  }
  if (colIndex.name === undefined) {
    console.error("Липсва колона name в първия ред.");
    process.exit(1);
  }

  const fields = [
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

  const batch = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    const name = cellStr(row[colIndex.name]);
    if (!name) continue;
    const rec = {
      company_id: companyId,
      name,
      in_contact: 0,
      visibility_scope: "admin_only",
      visible_to_staff_user_id: null,
      created_by_staff_user_id: null,
    };
    for (const f of fields) {
      if (f === "name") continue;
      const ci = colIndex[f];
      rec[f] = ci === undefined ? null : cellStr(row[ci]);
    }
    batch.push(rec);
  }

  console.log("Редове за вмъкване:", batch.length);

  let chunkSize = 200;
  let inserted = 0;
  let i = 0;
  while (i < batch.length) {
    const chunk = batch.slice(i, i + chunkSize);
    const { error } = await supabase.from("clients").insert(chunk);
    if (error) {
      if (chunkSize > 25) {
        console.warn(`Чанк ${chunkSize} не мина (${error.message}), опит с по-малък чанк…`);
        chunkSize = Math.max(25, Math.floor(chunkSize / 2));
        continue;
      }
      console.error(`Грешка при редове ${i + 1}–${i + chunk.length}:`, error.message);
      process.exit(1);
    }
    inserted += chunk.length;
    i += chunkSize;
    if (inserted % 1000 === 0 || inserted === batch.length) {
      console.log("  вмъкнати:", inserted);
    }
  }

  console.log("Готово. Общо вмъкнати клиенти:", inserted);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
