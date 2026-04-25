/**
 * Изтрива от фирма AST (Astralis) всички клиенти с in_contact != 1.
 * (Преди DELETE нулира client_id в client_activity_events — няма CASCADE.)
 *
 *   node scripts/delete-ast-not-in-contact.mjs
 *   node scripts/delete-ast-not-in-contact.mjs --code ast
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

let companyCode = "ast";
const argv = process.argv.slice(2);
const i = argv.indexOf("--code");
if (i >= 0 && argv[i + 1]) companyCode = argv[i + 1];

if (!url || !key) {
  console.error("Липсва .env с VITE_SUPABASE_URL и publishable/anon ключ.");
  process.exit(1);
}

const supabase = createClient(url, key);

const BATCH = 500;

/** @param {import('@supabase/supabase-js').SupabaseClient} sb @param {number[]} ids */
async function nullifyActivityClientIds(sb, ids) {
  for (let o = 0; o < ids.length; o += BATCH) {
    const slice = ids.slice(o, o + BATCH);
    const { error } = await sb.from("client_activity_events").update({ client_id: null }).in("client_id", slice);
    if (error) {
      throw new Error(`client_activity_events update: ${error.message}`);
    }
  }
}

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
  console.log(`Фирма: ${name} (id=${companyId}, code filter=${companyCode})`);

  const ids = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data: toRemove, error: listErr } = await supabase
      .from("clients")
      .select("id")
      .eq("company_id", companyId)
      .neq("in_contact", 1)
      .order("id", { ascending: true })
      .range(from, from + page - 1);
    if (listErr) {
      console.error(listErr.message);
      process.exit(1);
    }
    if (!toRemove?.length) break;
    for (const r of toRemove) ids.push(r.id);
    if (toRemove.length < page) break;
    from += page;
  }
  console.log(`Клиенти с in_contact != 1 за изтриване: ${ids.length}`);
  if (ids.length === 0) {
    console.log("Нищо за изтриване.");
    return;
  }

  await nullifyActivityClientIds(supabase, ids);

  const { error: delErr } = await supabase
    .from("clients")
    .delete()
    .eq("company_id", companyId)
    .neq("in_contact", 1);
  if (delErr) {
    console.error("DELETE:", delErr.message);
    process.exit(1);
  }

  const { count: remaining } = await supabase
    .from("clients")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .neq("in_contact", 1);
  console.log(`Оставащи „не в контакт“: ${remaining ?? 0} (трябва 0).`);
  console.log("Готово.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
