/**
 * Клиент към публичния регистър на КСБ (register.ksb.bg).
 * Заявките минават през Tauri (`ksb_http_request`), за да няма CORS.
 */

import type { ClientDraft } from "./db";

export const KSB_BASE = "https://register.ksb.bg";
export const KSB_LIST_FIRMS_URL = `${KSB_BASE}/listFirms.php`;
const KSB_FILTER_SUBMIT_VALUE = "Покажи строителите";

export interface KsbRegionOption {
  value: string;
  label: string;
}

export interface KsbGroupOption {
  value: string;
  label: string;
  groupTitle: string;
}

export interface KsbListRow {
  rowNo: number;
  idMembers: string;
  eik: string;
  builderName: string;
  protocol: string;
  note: string;
}

export interface KsbRepresentative {
  firstName: string;
  middleName: string;
  lastName: string;
  country: string;
  position: string;
  certRepresentative: string;
}

export interface KsbFirmDetail {
  eik: string;
  idMembers: string;
  tradeName: string;
  legalForm: string;
  representatives: KsbRepresentative[];
  /** Седалище (блок 5) */
  region: string;
  municipality: string;
  city: string;
  postalCode: string;
  street: string;
  streetNo: string;
  phoneCode: string;
  phone: string;
  email: string;
  /** Текст т.7 */
  descriptionText: string;
  /** Суров HTML блок „Групи и категории…“ за notes */
  groupsIntroHtml: string;
  /** Финансова таблица като текст */
  financeText: string;
}

async function invokeKsb(method: "GET" | "POST", url: string, body?: string): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("ksb_http_request", {
    method,
    url,
    body: body ?? null,
  });
}

export function buildListFirmsPostBody(pod: string, groupType: string): string {
  const p = new URLSearchParams();
  p.set("Podphp", pod);
  p.set("GroupTypephp", groupType);
  p.set("Pod", pod);
  p.set("GroupType", groupType);
  p.set("filter", KSB_FILTER_SUBMIT_VALUE);
  return p.toString();
}

export async function ksbFetchListFirmsForm(): Promise<string> {
  return invokeKsb("GET", KSB_LIST_FIRMS_URL);
}

export async function ksbPostListFirms(pod: string, groupType: string): Promise<string> {
  return invokeKsb("POST", KSB_LIST_FIRMS_URL, buildListFirmsPostBody(pod, groupType));
}

export async function ksbFetchFirmDetailByMemberId(idMembers: string): Promise<string> {
  const q = `${KSB_BASE}/pub_view.php?id_members=${encodeURIComponent(idMembers)}`;
  return invokeKsb("GET", q);
}

export function parseRegionOptionsFromListHtml(html: string): KsbRegionOption[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const sel = doc.querySelector('select[name="Pod"]');
  if (!sel) return [];
  return Array.from(sel.querySelectorAll("option")).map((o) => ({
    value: (o as HTMLOptionElement).value,
    label: (o.textContent ?? "").trim(),
  }));
}

/**
 * Парсира масива GrNames от inline script (както на сървъра).
 */
export function parseGroupOptionsFromListHtml(html: string): KsbGroupOption[] {
  const out: KsbGroupOption[] = [];
  const re = /GrNames\[\d+\]=new Array\("([^"]+)",'((?:\\'|[^'])*)'\);/g;
  let groupTitle = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const value = m[1];
    const label = m[2].replace(/\\'/g, "'");
    const num = Number(value);
    if (value !== "" && !Number.isNaN(num) && num % 10 === 0) {
      groupTitle = label;
    } else {
      out.push({ value, label, groupTitle });
    }
  }
  return out;
}

export function parseKsbResultsTable(html: string): KsbListRow[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows: KsbListRow[] = [];
  for (const table of Array.from(doc.querySelectorAll("table"))) {
    const ths = Array.from(table.querySelectorAll("tr th")).map((th) => (th.textContent ?? "").trim());
    if (!ths.some((t) => t.includes("ЕИК")) || !ths.some((t) => t.includes("Строител"))) continue;
    const trs = Array.from(table.querySelectorAll("tr")).slice(1);
    for (const tr of trs) {
      const tds = Array.from(tr.querySelectorAll("td"));
      if (tds.length < 4) continue;
      const noText = (tds[0].textContent ?? "").replace(/\s/g, "");
      const rowNo = parseInt(noText.replace(/\.$/, ""), 10);
      const a = tds[1].querySelector("a");
      const href = a?.getAttribute("href") ?? "";
      const idM = href.match(/id_members=(\d+)/i);
      const eik = (a?.textContent ?? "").trim();
      if (!idM || !eik) continue;
      rows.push({
        rowNo: Number.isFinite(rowNo) ? rowNo : rows.length + 1,
        idMembers: idM[1],
        eik,
        builderName: (tds[2].textContent ?? "").trim(),
        protocol: (tds[3].textContent ?? "").trim(),
        note: (tds[4]?.textContent ?? "").trim(),
      });
    }
  }
  return rows;
}

/** Уникални стойности на GroupType в реда от формата (за обхождане на всички категории). */
export function uniqueGroupTypeValuesInOrder(groups: KsbGroupOption[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of groups) {
    if (seen.has(g.value)) continue;
    seen.add(g.value);
    out.push(g.value);
  }
  return out;
}

/** Дедупликация по `id_members`, сортиране по име, нови номера на редовете. */
export function dedupeKsbListRows(rows: KsbListRow[]): KsbListRow[] {
  const m = new Map<string, KsbListRow>();
  for (const r of rows) {
    if (!m.has(r.idMembers)) m.set(r.idMembers, r);
  }
  const sorted = [...m.values()].sort((a, b) => a.builderName.localeCompare(b.builderName, "bg"));
  return sorted.map((r, i) => ({ ...r, rowNo: i + 1 }));
}

export function ksbListRowMatchesKeyword(row: KsbListRow, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  const hay = `${row.builderName} ${row.eik} ${row.protocol} ${row.note}`.toLowerCase();
  return hay.includes(t);
}

function textAfterLabel(html: string, label: string): string | null {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${esc}\\s*:\\s*&nbsp;\\s*([^<]+?)(?:<br\\s*/?>|</)`, "i");
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

function htmlCellToPlainText(cell: Element): string {
  return (cell.innerHTML ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Т.7 — таблица веднага след параграфа „7. Текстова информация…“. */
function extractKsbSection7Text(doc: Document): string {
  let p7: Element | null = null;
  for (const p of Array.from(doc.querySelectorAll("p"))) {
    const t = p.textContent ?? "";
    if (t.includes("7. Текстова информация за строителя")) {
      p7 = p;
      break;
    }
  }
  if (!p7) return "";
  let sib: Element | null = p7.nextElementSibling;
  while (sib) {
    const tag = sib.tagName.toLowerCase();
    if (tag === "table") {
      const cell = sib.querySelector("tr td");
      if (cell) return htmlCellToPlainText(cell);
      return "";
    }
    const nested = sib.querySelector("table");
    if (nested) {
      const cell = nested.querySelector("tr td");
      if (cell) return htmlCellToPlainText(cell);
    }
    sib = sib.nextElementSibling;
  }
  return "";
}

/** Резерв: първи td с class st11 след заглавието на т.7 (единични/двойни кавички). */
function extractKsbSection7TextFallback(html: string): string {
  const mark = "7. Текстова информация за строителя";
  const i = html.indexOf(mark);
  if (i < 0) return "";
  const slice = html.slice(i, i + 12000);
  const re = /<td[^>]*class\s*=\s*["']st11["'][^>]*>([\s\S]*?)<\/td>/i;
  const m = slice.match(re);
  if (!m) return "";
  return m[1]
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

export function parseKsbFirmDetailHtml(html: string, idMembers: string): KsbFirmDetail | null {
  const eikM = html.match(/ЕИК по БУЛСТАТ:\s*(\d+)/);
  if (!eikM) return null;
  const eik = eikM[1];
  const tradeName = textAfterLabel(html, "наименование") ?? "";
  const legalForm = textAfterLabel(html, "правно-организационна форма") ?? "";

  const doc = new DOMParser().parseFromString(html, "text/html");
  let descriptionText = extractKsbSection7Text(doc);
  if (!descriptionText) descriptionText = extractKsbSection7TextFallback(html);

  const representatives: KsbRepresentative[] = [];
  const tables = Array.from(doc.querySelectorAll("table"));
  for (const table of tables) {
    const headerRow = table.querySelector("tr");
    if (!headerRow) continue;
    const h = (headerRow.textContent ?? "").toLowerCase();
    if (!h.includes("представляващ") || !h.includes("длъжност")) continue;
    const dataRows = Array.from(table.querySelectorAll("tr")).slice(1);
    for (const tr of dataRows) {
      const tds = Array.from(tr.querySelectorAll("td"));
      if (tds.length < 7) continue;
      representatives.push({
        firstName: (tds[1].textContent ?? "").trim(),
        middleName: (tds[2].textContent ?? "").trim(),
        lastName: (tds[3].textContent ?? "").trim(),
        country: (tds[4].textContent ?? "").trim(),
        position: (tds[5].textContent ?? "").trim(),
        certRepresentative: (tds[6].textContent ?? "").trim(),
      });
    }
    break;
  }

  const idx = html.indexOf("5. Седалище на строителя");
  let block5 = html;
  if (idx >= 0) {
    const end6a = html.indexOf("6. Адрес за кореспонденция", idx + 1);
    const end6b = html.indexOf("<p class='podr'>6.", idx + 1);
    const end = [end6a, end6b].filter((x) => x > idx).sort((a, b) => a - b)[0] ?? idx + 3500;
    block5 = html.slice(idx, end);
  }
  const pick = (src: string, lab: string) => textAfterLabel(src, lab) ?? "";
  const region = pick(block5, "област");
  const municipality = pick(block5, "община");
  const city = pick(block5, "град(село)");
  const postalCode = pick(block5, "пощенски код");
  const street = pick(block5, "улица,/ж.к.,бл.,вх.,ет.,ап./");
  const streetNo = pick(block5, "номер");
  const phoneCode = pick(block5, "тел.код");
  const phone = pick(block5, "Телефон");
  const email = pick(block5, "E-mail");

  let groupsIntroHtml = "";
  const gIdx = html.indexOf("ГРУПИ И КАТЕГОРИИ СТРОЕЖИ");
  if (gIdx >= 0) {
    const end = html.indexOf("СПРАВКИ И ДОКУМЕНТИ", gIdx);
    groupsIntroHtml = end > gIdx ? html.slice(gIdx, end) : html.slice(gIdx, gIdx + 8000);
  }

  let financeText = "";
  const fIdx = html.indexOf("ГОДИШЕН ФИНАНСОВ ОТЧЕТ");
  if (fIdx >= 0) {
    const sub = html.slice(fIdx, fIdx + 6000);
    const ft = sub.match(/<table[^>]*>[\s\S]*?<\/table>/i);
    if (ft) financeText = stripHtmlToText(ft[0]);
  }

  return {
    eik,
    idMembers,
    tradeName,
    legalForm,
    representatives,
    region,
    municipality,
    city,
    postalCode,
    street,
    streetNo,
    phoneCode,
    phone,
    email,
    descriptionText,
    groupsIntroHtml,
    financeText,
  };
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatAddress(d: KsbFirmDetail): string {
  const parts = [
    d.region,
    d.municipality,
    d.city,
    d.postalCode ? `ПК ${d.postalCode}` : "",
    d.street,
    d.streetNo ? `№ ${d.streetNo}` : "",
  ].filter(Boolean);
  return parts.join(", ");
}

function pickContactPerson(d: KsbFirmDetail): string {
  const mgr = d.representatives.find((r) => r.position.toLowerCase().includes("управител"));
  if (mgr) {
    return [mgr.firstName, mgr.middleName, mgr.lastName].filter(Boolean).join(" ");
  }
  const cert = d.representatives.find((r) => r.certRepresentative.toLowerCase().startsWith("д"));
  if (cert) {
    return [cert.firstName, cert.middleName, cert.lastName].filter(Boolean).join(" ");
  }
  const first = d.representatives[0];
  if (first) return [first.firstName, first.middleName, first.lastName].filter(Boolean).join(" ");
  return "";
}

export function ksbFirmDetailToClientDraft(d: KsbFirmDetail): ClientDraft {
  const phone =
    d.phoneCode && d.phone ? `${d.phoneCode.trim()} / ${d.phone.trim()}`.replace(/^\/\s*/, "") : d.phone || d.phoneCode || "";

  const notesT7 = (d.descriptionText ?? "").trim();

  return {
    name: d.tradeName || `Фирма ${d.eik}`,
    company: d.legalForm ? `${d.tradeName} ${d.legalForm}`.trim() : d.tradeName || null,
    turnover: null,
    phone: phone || null,
    email: d.email?.trim() ? d.email.trim() : null,
    address: formatAddress(d) || null,
    eik: d.eik,
    vat_number: null,
    contact_person: pickContactPerson(d) || null,
    bank_account: null,
    notes: notesT7 ? notesT7 : null,
    in_contact: 0,
  };
}
