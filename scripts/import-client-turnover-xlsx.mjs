/**
 * Обновява clients.turnover от .xlsx — съпоставяне по име; при няколко клиента със същото име — по company.
 *
 * Очаква заглавен ред с name и Turnover/turnover/оборот (както при import-clients-xlsx).
 * Стойностите на оборот се записват като текст (както е колоната в БД).
 *
 * Употреба (от c:\dev\klienti):
 *   node scripts/import-client-turnover-xlsx.mjs "C:\path\file.xlsx" --code BTX2026
 *   node scripts/import-client-turnover-xlsx.mjs "..." --dry-run
 *
 * Изисква .env: VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY или VITE_SUPABASE_ANON_KEY
 */

import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import dotenv from "dotenv";
import { existsSync, writeFileSync } from "fs";
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

/** Текст за turnover: числа от Excel като нормален низ без scientific при големи стойности. */
function turnoverToText(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    if (Number.isInteger(v)) return String(v);
    return String(v);
  }
  const s = String(v).replace(/\0/g, "").trim();
  return s.length ? s : null;
}

function normKey(s) {
  if (s == null) return "";
  return String(s)
    .replace(/\0/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

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
  };
  return map[k] ?? null;
}

function parseArgs(argv) {
  let filePath = null;
  let companyCode = "BTX2026";
  let dryRun = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--code" && argv[i + 1]) {
      companyCode = argv[++i];
    } else if (a === "--dry-run") {
      dryRun = true;
    } else if (!a.startsWith("-")) {
      filePath = a;
    }
  }
  return { filePath, companyCode, dryRun };
}

const PAGE = 1000;

async function fetchAllClients(supabase, companyId) {
  const out = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, company, turnover")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function main() {
  const { filePath, companyCode, dryRun } = parseArgs(process.argv);
  if (!url || !key) {
    console.error("Липсва .env с VITE_SUPABASE_URL и publishable/anon ключ.");
    process.exit(1);
  }
  if (!filePath) {
    console.error(
      'Подай път към .xlsx, напр. node scripts/import-client-turnover-xlsx.mjs "C:\\...\\file.xlsx" --code BTX2026'
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
  console.log("Файл:", resolved);
  console.log("Фирма:", compRows[0].name, `(id=${companyId}, code=${companyCode})`);
  if (dryRun) console.log("Режим: --dry-run (няма запис в базата)");

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
  if (colIndex.turnover === undefined) {
    console.error("Липсва колона Turnover/turnover/оборот в първия ред.");
    process.exit(1);
  }

  const excelRows = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    const name = cellStr(row[colIndex.name]);
    if (!name) continue;
    const company = colIndex.company !== undefined ? cellStr(row[colIndex.company]) : null;
    const turnover = turnoverToText(row[colIndex.turnover]);
    if (turnover == null) continue;
    excelRows.push({ name, company, turnover, sheetRow: r + 1 });
  }
  console.log("Редове в Excel с име + turnover:", excelRows.length);

  console.log("Зареждане на клиенти от базата…");
  const clients = await fetchAllClients(supabase, companyId);
  console.log("Клиенти в базата (активни):", clients.length);

  /** @type {Map<string, { id: number; name: string; company: string | null }[]>} */
  const byName = new Map();
  /** Съвпадение по clients.company (когато в Excel „име“ = фирмено име в нашата колона company). */
  const byCompany = new Map();
  for (const c of clients) {
    const nk = normKey(c.name);
    if (!byName.has(nk)) byName.set(nk, []);
    byName.get(nk).push({ id: c.id, name: c.name, company: c.company });
    const ck = normKey(c.company);
    if (ck) {
      if (!byCompany.has(ck)) byCompany.set(ck, []);
      byCompany.get(ck).push({ id: c.id, name: c.name, company: c.company });
    }
  }

  function resolvePick(ex, candidates, source) {
    let pick = candidates;
    if (pick.length > 1 && ex.company) {
      const ck = normKey(ex.company);
      const filtered = pick.filter((c) => normKey(c.company ?? "") === ck);
      if (filtered.length === 1) pick = filtered;
      else if (filtered.length === 0) {
        return { ok: false, reason: `име (${source}), company не съвпада с никой от дубликатите` };
      } else {
        return { ok: false, ambiguous: filtered.map((c) => c.id) };
      }
    }
    if (pick.length > 1) {
      return { ok: false, ambiguous: pick.map((c) => c.id) };
    }
    return { ok: true, id: pick[0].id };
  }

  const updates = [];
  const unmatched = [];
  const ambiguous = [];

  for (const ex of excelRows) {
    const nk = normKey(ex.name);
    const fromName = byName.get(nk);
    if (fromName && fromName.length > 0) {
      const r = resolvePick(ex, fromName, "name");
      if (r.ok) {
        updates.push({ id: r.id, turnover: ex.turnover, name: ex.name });
        continue;
      }
      if (r.ambiguous) {
        ambiguous.push({ ...ex, ids: r.ambiguous });
        continue;
      }
      unmatched.push({ ...ex, reason: r.reason });
      continue;
    }

    const tryKeys = [nk, normKey(ex.company)].filter((k, i, a) => k && a.indexOf(k) === i);
    let found = null;
    for (const k of tryKeys) {
      const list = byCompany.get(k);
      if (list && list.length === 1) {
        found = list[0];
        break;
      }
    }
    if (found) {
      updates.push({ id: found.id, turnover: ex.turnover, name: ex.name });
      continue;
    }

    unmatched.push({ ...ex, reason: "няма съвпадение по name и по уникален company" });
  }

  console.log("Съпоставени за обновяване:", updates.length);
  console.log("Без съвпадение (име/фирма):", unmatched.length);
  console.log("Неясни (няколко клиента, без уникален company):", ambiguous.length);

  const reportPath = path.join(root, "scripts", "import-turnover-report.json");
  writeFileSync(
    reportPath,
    JSON.stringify({ unmatched: unmatched.slice(0, 500), ambiguous: ambiguous.slice(0, 200) }, null, 2),
    "utf8"
  );
  console.log("Примерен отчет (до 500 unmatched / 200 ambiguous):", reportPath);

  if (dryRun) {
    console.log("Dry-run — спираме без UPDATE.");
    process.exit(0);
  }

  const CONCURRENCY = 30;
  let done = 0;
  let errCount = 0;
  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const slice = updates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      slice.map(({ id, turnover }) =>
        supabase
          .from("clients")
          .update({ turnover, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("company_id", companyId)
      )
    );
    for (const res of results) {
      if (res.error) {
        errCount++;
        if (errCount <= 5) console.error("UPDATE грешка:", res.error.message);
      } else {
        done++;
      }
    }
    if ((i + slice.length) % 500 === 0 || i + slice.length >= updates.length) {
      console.log("  обновени опити:", Math.min(i + slice.length, updates.length), "/", updates.length);
    }
  }
  console.log("Готово. Успешни обновявания (без грешка в отговора):", done);
  if (errCount) console.log("Редове с грешка от Supabase:", errCount);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
