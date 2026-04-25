/**
 * Качва от .xlsx само клиенти, които още НЕ СА в базата (фирма по подразбиране: ast).
 * Дедуп: нормализиран ЕИК (само цифри), иначе ключ име|фирма.
 *
 *   node scripts/import-ast-cml-new-only.mjs "C:\\...\\файл.xlsx"
 *   node scripts/import-ast-cml-new-only.mjs "..." --dry-run
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
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY?.trim();

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
  if (v instanceof Date) return v.toISOString();
  const s = String(v)
    .replace(/\0/g, "")
    .trim();
  return s.length ? s : null;
}

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
    tel: "phone",
    mobile: "phone",
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
  return map[k] ?? null;
}

function getCell(row, len, c) {
  if (c < 0 || c >= len) return null;
  return cellToText(row[c]);
}

/** @param {string|null|undefined} s */
function normText(s) {
  if (s == null) return "";
  return String(s)
    .replace(/\0/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .normalize("NFC");
}

/** @param {string|null|undefined} raw */
function normEikKey(raw) {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 5) return digits;
  return normText(t) || null;
}

/** @param {string} name @param {string|null} company */
function nameCompanyKey(name, company) {
  return `nc|${normText(name)}|${normText(company)}`;
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

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} sb
 * @param {number} companyId
 */
async function loadExistingKeys(sb, companyId) {
  const eikSet = new Set();
  const nameCompany = new Set();
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await sb
      .from("clients")
      .select("name, company, eik")
      .eq("company_id", companyId)
      .order("id", { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const r of data) {
      const ek = normEikKey(r.eik);
      if (ek) eikSet.add(ek);
      if (r.name) nameCompany.add(nameCompanyKey(r.name, r.company));
    }
    if (data.length < page) break;
    from += page;
  }
  return { eikSet, nameCompany };
}

async function main() {
  const { filePath, companyCode, dry } = parseArgs(process.argv);
  if (!url || !key) {
    console.error("Липсва .env");
    process.exit(1);
  }
  if (!filePath) {
    console.error('Подай път към .xlsx, напр. node scripts/import-ast-cml-new-only.mjs "C:\\...\\file.xlsx"');
    process.exit(1);
  }
  const resolved = path.resolve(filePath);
  if (!existsSync(resolved)) {
    console.error("Файлът не съществува:", resolved);
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const { data: compRows, error: rpcErr } = await supabase.rpc("lookup_company_by_code", { p_code: companyCode });
  if (rpcErr) {
    console.error(rpcErr.message);
    process.exit(1);
  }
  if (!compRows?.length) {
    console.error("Няма фирма:", companyCode);
    process.exit(1);
  }
  const companyId = compRows[0].id;
  console.log("Файл:", resolved);
  console.log("Фирма:", compRows[0].name, `id=${companyId}`);

  const { eikSet, nameCompany: existingNc } = await loadExistingKeys(supabase, companyId);
  console.log("В базата: уникални ЕИК-ключове (цифри):", eikSet.size, "· име+фирма ключове:", existingNc.size);

  const eikFile = new Set(eikSet);
  const ncFile = new Set(existingNc);

  const wb = XLSX.readFile(resolved);
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  if (matrix.length < 2) {
    console.error("Празен файл.");
    process.exit(1);
  }
  const rawHeader = matrix[0].map((h) => String(h ?? "").replace(/\s+/g, " ").trim());
  const firstColByField = {};
  const duplicateCols = [];
  const unknownHeaderCols = [];
  for (let c = 0; c < rawHeader.length; c++) {
    const f = headerToField(rawHeader[c] || `Column${c + 1}`);
    if (f) {
      if (firstColByField[f] === undefined) firstColByField[f] = c;
      else duplicateCols.push({ c, h: rawHeader[c] || f, f });
    } else unknownHeaderCols.push({ c, h: rawHeader[c] || `Col${c + 1}` });
  }
  const nameCol = firstColByField["name"];
  if (nameCol === undefined) {
    console.error("Няма колона name");
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
  console.log("Редове във файла (със записвано име):", importRows.length);

  const newRows = [];
  let skippedEik = 0;
  let skippedNameCompany = 0;
  for (const std of importRows) {
    const ek = normEikKey(std.eik);
    const nck = nameCompanyKey(std.name, std.company);
    if (ek && eikFile.has(ek)) {
      skippedEik++;
      continue;
    }
    if (ncFile.has(nck)) {
      skippedNameCompany++;
      continue;
    }
    if (ek) eikFile.add(ek);
    ncFile.add(nck);
    newRows.push(std);
  }
  console.log("Пропуснати (вече в база/файл, по ЕИК):", skippedEik);
  console.log("Пропуснати (по име+фирма):", skippedNameCompany);
  console.log("Нови за вмъкване:", newRows.length);
  if (dry) {
    console.log("--dry-run: няма insert.");
    return;
  }
  if (newRows.length === 0) {
    console.log("Готово (няма какво да се добави).");
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

  let chunkSize = 200;
  let inserted = 0;
  let i = 0;
  const batch = newRows.map(baseRow);
  while (i < batch.length) {
    const chunk = batch.slice(i, i + chunkSize);
    const { error } = await supabase.from("clients").insert(chunk);
    if (error) {
      if (chunkSize > 25) {
        console.warn(`Чанк ${chunkSize}: ${error.message} — намалявам.`);
        chunkSize = Math.max(25, Math.floor(chunkSize / 2));
        continue;
      }
      console.error(error.message);
      process.exit(1);
    }
    inserted += chunk.length;
    i += chunkSize;
    if (inserted % 500 === 0 || inserted === batch.length) console.log("  вмъкнати:", inserted);
  }
  console.log("Готово. Вмъкнати:", inserted);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
