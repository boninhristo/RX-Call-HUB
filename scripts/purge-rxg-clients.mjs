/**
 * Изтрива напълно всички клиенти на фирма RXG (и CASCADE към свързани таблици).
 *
 *   node scripts/purge-rxg-clients.mjs
 *   node scripts/purge-rxg-clients.mjs --code BTX2026   # друга фирма по код за вход
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

dotenv.config({ path: path.join(root, ".env") });

const url = process.env.VITE_SUPABASE_URL?.trim();
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.VITE_SUPABASE_ANON_KEY?.trim();

let companyCode = "RXG";
const argv = process.argv.slice(2);
const i = argv.indexOf("--code");
if (i >= 0 && argv[i + 1]) companyCode = argv[i + 1];

if (!url || !key) {
  console.error("Липсва .env с VITE_SUPABASE_URL и publishable/anon ключ.");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const { data: rows, error: rpcErr } = await supabase.rpc("lookup_company_by_code", {
    p_code: companyCode,
  });
  if (rpcErr) {
    console.error(rpcErr.message);
    process.exit(1);
  }
  if (!rows?.length) {
    console.error(`Няма фирма с код: ${companyCode}`);
    process.exit(1);
  }
  const companyId = rows[0].id;
  const name = rows[0].name;
  console.log(`Фирма: ${name} (id=${companyId}, code=${companyCode})`);

  const { count: before, error: cErr } = await supabase
    .from("clients")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId);
  if (cErr) {
    console.error(cErr.message);
    process.exit(1);
  }
  console.log(`Клиенти преди изтриване: ${before ?? "?"}`);

  const { error: delErr } = await supabase.from("clients").delete().eq("company_id", companyId);
  if (delErr) {
    console.error("DELETE:", delErr.message);
    process.exit(1);
  }

  const { count: after } = await supabase
    .from("clients")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId);
  console.log(`Клиенти след изтриване: ${after ?? 0}`);
  console.log("Готово.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
