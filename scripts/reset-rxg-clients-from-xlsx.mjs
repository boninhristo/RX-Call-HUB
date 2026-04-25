/**
 * RXG: изтрива всички клиенти за тенанта, после ги създава наново от .xlsx (вкл. колона Turnover, ако я има).
 *
 * Стъпки: purge-rxg-clients → import-clients-xlsx (същата логика като отделните скриптове).
 *
 *   node scripts/reset-rxg-clients-from-xlsx.mjs "C:\path\file.xlsx" --confirm
 *   node scripts/reset-rxg-clients-from-xlsx.mjs "..." --code RXG --confirm
 *
 * Без флага --confirm скриптът спира (защита от случайно изпълнение).
 */

import { spawnSync } from "child_process";
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

function parseArgs(argv) {
  let filePath = null;
  let companyCode = "RXG";
  let confirmed = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--code" && argv[i + 1]) {
      companyCode = argv[++i];
    } else if (a === "--confirm") {
      confirmed = true;
    } else if (!a.startsWith("-")) {
      filePath = a;
    }
  }
  return { filePath, companyCode, confirmed };
}

function runNode(scriptRelative, args) {
  const script = path.join(root, scriptRelative);
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  return r.status ?? 1;
}

function main() {
  const { filePath, companyCode, confirmed } = parseArgs(process.argv);
  if (!url || !key) {
    console.error("Липсва .env с VITE_SUPABASE_URL и publishable/anon ключ.");
    process.exit(1);
  }
  if (!filePath) {
    console.error(
      'Подай път към .xlsx и --confirm, напр. node scripts/reset-rxg-clients-from-xlsx.mjs "C:\\...\\file.xlsx" --confirm'
    );
    process.exit(1);
  }
  if (!confirmed) {
    console.error("Добави --confirm за да изтриеш всички клиенти на тази фирма и да импортираш отново.");
    process.exit(1);
  }
  const resolved = path.resolve(filePath);
  if (!existsSync(resolved)) {
    console.error("Файлът не съществува:", resolved);
    process.exit(1);
  }

  console.log("=== 1/2: Изтриване на всички клиенти за фирма", companyCode, "===");
  const purgeExit = runNode("scripts/purge-rxg-clients.mjs", ["--code", companyCode]);
  if (purgeExit !== 0) {
    console.error("Purge спря с код", purgeExit);
    process.exit(purgeExit);
  }

  console.log("\n=== 2/2: Импорт от Excel (вкл. Turnover при налична колона) ===");
  const importExit = runNode("scripts/import-clients-xlsx.mjs", [resolved, "--code", companyCode]);
  if (importExit !== 0) {
    console.error("Импортът спря с код", importExit);
    process.exit(importExit);
  }

  console.log("\nГотово: RXG (или избраният код) е изчистен и клиентите са създадени наново от файла.");
}

main();
