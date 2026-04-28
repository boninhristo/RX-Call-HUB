import { getSupabase } from "./supabase";
import { getStoredRole } from "./auth";
import { getActorUserIdForActivity, getAdminActorProfile, getCompanyId, getLastOrgCode, getStaffUserId } from "./session";
import { initialsFromFullName } from "./format";

function requireCompanyId(): number {
  const id = getCompanyId();
  if (id == null) throw new Error("Няма избрана организация.");
  return id;
}

// Case-insensitive substring check (same as before; works for Cyrillic in JS)
function containsIgnoreCase(text: string | null | undefined, term: string): boolean {
  if (!text) return false;
  return text.toLowerCase().includes(term.toLowerCase());
}

function nowIso(): string {
  return new Date().toISOString();
}

export type ClientVisibilityScope = "everyone" | "admin_only" | "staff_only";

function isAdminRole(): boolean {
  return getStoredRole() === "admin";
}

/**
 * Видимост за роля `clients`. Ако `listSearch` е непразен, комбинираме с OR за търсенето в един
 * `or=(and(or(видимост),or(колони…)))`, защото две последователни `.or()` към PostgREST често
 * дават само едната група (търсенето изчезва или видимостта).
 */
function applyClientVisibilityReadFilter<T>(q: T, listSearch?: string): T {
  if (getStoredRole() !== "clients") return q;
  const staffId = getStaffUserId();
  if (staffId == null) {
    return (q as any).eq("id", -1);
  }
  const visOr = `visibility_scope.eq.everyone,and(visibility_scope.eq.staff_only,visible_to_staff_user_id.eq.${staffId})`;
  const term = (listSearch ?? "").trim();
  if (!term) {
    return (q as any).or(visOr);
  }
  const pat = postgrestIlikeContainsPattern(term);
  const searchOr = clientsSearchIlikeOrBranches(pat);
  return (q as any).or(`and(or(${visOr}),or(${searchOr}))`);
}

/** Календарен ден в локалната часова зона (YYYY-MM-DD) за групиране в статистиката. */
export function localDayKeyFromIso(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Код на текущата фирма (от последния успешен вход), за различно поведение BTX / RXG и т.н. */
function statsOrgCodeLower(): string {
  return (getLastOrgCode() ?? "").trim().toLowerCase();
}

/** Начало на текущия календарен час в локалната часова зона (ms). */
function startOfCurrentLocalHourMs(): number {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setMilliseconds(0);
  return d.getTime();
}

export type ActivityEventType =
  | "contact"
  | "conversation"
  | "meeting"
  | "order"
  | "client_created"
  | "conversation_deleted"
  | "meeting_deleted"
  | "order_deleted"
  | "client_deleted";

async function logActivityEvent(
  clientId: number | null,
  eventType: ActivityEventType,
  refId: number | null,
  metadata?: Record<string, unknown> | null
): Promise<void> {
  const sb = getSupabase();
  const actor_user_id = getActorUserIdForActivity();
  let meta: Record<string, unknown> = { ...(metadata ?? {}) };
  if (getStoredRole() === "admin") {
    const p = getAdminActorProfile();
    if (p?.kind === "named") {
      meta = {
        ...meta,
        admin_actor_label: p.label,
        admin_actor_initials: p.initials,
      };
    }
  }
  const { error } = await sb.from("client_activity_events").insert({
    client_id: clientId,
    occurred_at: nowIso(),
    event_type: eventType,
    ref_id: refId,
    metadata: meta,
    actor_user_id: actor_user_id ?? null,
    company_id: requireCompanyId(),
  });
  if (error) throw new Error(error.message);
}

function sortClientsList(list: Client[]): Client[] {
  return [...list].sort((a, b) => {
    const ac = a.in_contact === 1 ? 1 : 0;
    const bc = b.in_contact === 1 ? 1 : 0;
    if (ac !== bc) return bc - ac;
    const ad = new Date(a.last_activity || a.updated_at || a.created_at).getTime();
    const bd = new Date(b.last_activity || b.updated_at || b.created_at).getTime();
    if (ad !== bd) return bd - ad;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Escape за стойност в PostgREST ILIKE (в т.ч. в `.or()`).
 * Запетаите в текста чупят OR-списъка — заменяме с интервал.
 * В URL `%` е проблемен; PostgREST приема `*` като wildcard вместо `%`.
 * Стойността се връща в двойни кавички (резервирани символи `.`, `,`, `:` и т.н.).
 */
function escapeForIlikePattern(term: string): string {
  return term
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, " ");
}

/** PostgREST ILIKE: „съдържа“ — wildcard `*` (не `%`), стойност в кавички. */
function postgrestIlikeContainsPattern(trimmedTerm: string): string {
  const esc = escapeForIlikePattern(trimmedTerm);
  return `"*${esc}*"`;
}

function clientsSearchIlikeOrBranches(ilikeValue: string): string {
  // Без turnover.ilike: при база без migration 025 PostgREST гърми („column … does not exist“).
  // След `ALTER TABLE clients ADD COLUMN turnover text` може да се върне редът тук.
  return [
    `name.ilike.${ilikeValue}`,
    `company.ilike.${ilikeValue}`,
    `phone.ilike.${ilikeValue}`,
    `email.ilike.${ilikeValue}`,
    `address.ilike.${ilikeValue}`,
    `eik.ilike.${ilikeValue}`,
    `vat_number.ilike.${ilikeValue}`,
    `contact_person.ilike.${ilikeValue}`,
    `bank_account.ilike.${ilikeValue}`,
    `notes.ilike.${ilikeValue}`,
  ].join(",");
}

export type ClientsInContactFilter = "all" | "contacted" | "not_contacted";

/** Сортируеми колони в списъка клиенти (сървърно сортиране). */
export type ClientsSortColumn = "name" | "company" | "turnover" | "address" | "access";

export interface ClientsPageParams {
  page: number;
  pageSize: number;
  search: string;
  inContactFilter?: ClientsInContactFilter;
  /** Само за админ: "all" | "created:<id>" | "access:<id>" */
  staffFilter?: string;
  /** Ако е зададено — замества подразбиращото се сортиране (контакт / активност). */
  sortColumn?: ClientsSortColumn | null;
  /** true = възходящ (A→Z); false = низходящ. За Turnover първи клик обикновено е false (голямо→малко). */
  sortAscending?: boolean;
}

function applyInContactClientsFilter<T>(q: T, inContactFilter: ClientsInContactFilter | undefined): T {
  const f = inContactFilter ?? "all";
  if (f === "contacted") return (q as any).eq("in_contact", 1);
  if (f === "not_contacted") return (q as any).neq("in_contact", 1);
  return q;
}

function applyAdminStaffStringClientsFilter<T>(q: T, staffFilter: string | undefined): T {
  const sf = staffFilter ?? "all";
  if (!isAdminRole() || sf === "all") return q;
  if (sf.startsWith("created:")) {
    const sid = parseInt(sf.slice(8), 10);
    if (!Number.isFinite(sid)) return q;
    return (q as any).eq("created_by_staff_user_id", sid);
  }
  if (sf.startsWith("access:")) {
    const sid = parseInt(sf.slice(7), 10);
    if (!Number.isFinite(sid)) return q;
    return (q as any).eq("visibility_scope", "staff_only").eq("visible_to_staff_user_id", sid);
  }
  return q;
}

function applySearchIlikeClientsFilter<T>(q: T, search: string): T {
  const term = search.trim();
  if (!term) return q;
  // За `clients` търсенето вече е в `applyClientVisibilityReadFilter(..., search)`.
  if (getStoredRole() === "clients") return q;
  const pat = postgrestIlikeContainsPattern(term);
  return (q as any).or(clientsSearchIlikeOrBranches(pat));
}

/** Страница клиенти + общ брой (без лимит 1000 на PostgREST). */
export async function getClientsPage(params: ClientsPageParams): Promise<{ clients: Client[]; total: number }> {
  const {
    page,
    pageSize,
    search,
    inContactFilter = "all",
    staffFilter = "all",
    sortColumn = null,
    sortAscending = true,
  } = params;
  const sb = getSupabase();
  const c = requireCompanyId();
  const from = Math.max(0, page) * pageSize;
  const to = from + pageSize - 1;

  let q = sb
    .from("clients")
    .select("*", { count: "exact" })
    .eq("company_id", c)
    .is("deleted_at", null);
  q = applyClientVisibilityReadFilter(q, search);
  q = applyInContactClientsFilter(q, inContactFilter);
  q = applyAdminStaffStringClientsFilter(q, staffFilter);
  q = applySearchIlikeClientsFilter(q, search);

  const asc = sortAscending;
  if (sortColumn) {
    switch (sortColumn) {
      case "name":
        q = q.order("name", { ascending: asc, nullsFirst: false });
        break;
      case "company":
        q = q.order("company", { ascending: asc, nullsFirst: false });
        break;
      case "turnover":
        q = q.order("turnover_sort", { ascending: asc, nullsFirst: false });
        break;
      case "address":
        q = q.order("address_sort", { ascending: asc, nullsFirst: false });
        break;
      case "access":
        q = q
          .order("visibility_scope", { ascending: asc, nullsFirst: true })
          .order("visible_to_staff_user_id", { ascending: asc, nullsFirst: true });
        break;
      default:
        break;
    }
    q = q.order("id", { ascending: true });
  } else {
    q = q
      .order("in_contact", { ascending: false })
      .order("last_activity", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .order("name", { ascending: true });
  }
  q = q.range(from, to);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  const clients = (data ?? []) as Client[];
  return { clients, total: count ?? clients.length };
}

/** Всички id, които отговарят на същите филтри като списъка (за „маркирай всички“). */
export async function fetchAllClientIdsForClientsList(params: {
  search: string;
  inContactFilter?: ClientsInContactFilter;
  staffFilter?: string;
}): Promise<number[]> {
  const { search, inContactFilter = "all", staffFilter = "all" } = params;
  const sb = getSupabase();
  const c = requireCompanyId();
  const pageSize = 1000;
  const ids: number[] = [];
  let from = 0;
  for (;;) {
    let q = sb
      .from("clients")
      .select("id")
      .eq("company_id", c)
      .is("deleted_at", null);
    q = applyClientVisibilityReadFilter(q, search);
    q = applyInContactClientsFilter(q, inContactFilter);
    q = applyAdminStaffStringClientsFilter(q, staffFilter);
    q = applySearchIlikeClientsFilter(q, search);
    q = q.order("id", { ascending: true }).range(from, from + pageSize - 1);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as { id: number }[];
    for (const row of batch) ids.push(row.id);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return ids;
}

function clientSearchTextFromRow(r: {
  name: string;
  company: string | null;
  turnover?: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  client_conversations?: { notes: string | null }[] | null;
  client_orders?: { description: string | null; documents: string | null }[] | null;
  client_custom_fields?: { field_name: string; field_value: string | null }[] | null;
  client_purchases?: { brand: string | null; model: string | null; note: string | null }[] | null;
}): string {
  const parts: string[] = [
    r.name,
    r.company ?? "",
    r.turnover ?? "",
    r.phone ?? "",
    r.email ?? "",
    r.address ?? "",
    r.notes ?? "",
  ];
  for (const x of r.client_conversations ?? []) parts.push(x.notes ?? "");
  for (const x of r.client_orders ?? []) parts.push(`${x.description ?? ""} ${x.documents ?? ""}`);
  for (const x of r.client_custom_fields ?? []) parts.push(`${x.field_name} ${x.field_value ?? ""}`);
  for (const x of r.client_purchases ?? []) parts.push(`${x.brand ?? ""} ${x.model ?? ""} ${x.note ?? ""}`);
  return parts.join(" ");
}

// Clients
export interface Client {
  id: number;
  name: string;
  company: string | null;
  /** Оборот (импорт / ръчно); текст за гъвкави формати от Excel. */
  turnover: string | null;
  /** Генерирана колона за сортиране по оборот като число (миграция 027). */
  turnover_sort?: number | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  eik: string | null;
  vat_number: string | null;
  contact_person: string | null;
  bank_account: string | null;
  notes: string | null;
  in_contact: number;
  last_activity: string | null;
  visibility_scope: ClientVisibilityScope;
  visible_to_staff_user_id: number | null;
  created_by_staff_user_id: number | null;
  deleted_at: string | null;
  deleted_by_role: "admin" | "clients" | null;
  deleted_by_staff_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export type DeletedClient = Client;

export type ClientDraft = Pick<
  Client,
  | "name"
  | "company"
  | "turnover"
  | "phone"
  | "email"
  | "address"
  | "eik"
  | "vat_number"
  | "contact_person"
  | "bank_account"
  | "notes"
  | "in_contact"
>;

export interface ConversationScript {
  id: number;
  script_code: string;
  name: string;
  machine_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConversationScriptStep {
  id: number;
  script_id: number;
  step_no: number;
  step_type: "question" | "info" | "selling_point";
  question: string;
  answer_type: "text" | "number" | "date" | "yes_no" | "choice";
  required: boolean;
}

export interface MachineCatalogItem {
  id: number;
  machine_code: string;
  machine_type: string;
  model_name: string;
  price_eur: number | null;
  specs: string | null;
  features: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MachineSellingPoint {
  id: number;
  machine_type: string;
  priority: number;
  text: string;
  is_active: boolean;
  created_at: string;
}

export interface ConversationTextScript {
  id: string;
  name: string;
  content: string;
  updated_at: string;
}

async function updateClientActivity(clientId: number, activityAt?: string): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const ts = activityAt || nowIso();
  const { data: row, error: fetchErr } = await sb
    .from("clients")
    .select("last_activity")
    .eq("id", clientId)
    .eq("company_id", c)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  let newLast = ts;
  if (row?.last_activity) {
    const cur = new Date(row.last_activity as string).getTime();
    const next = new Date(ts).getTime();
    if (cur >= next) newLast = row.last_activity as string;
  }
  const { error } = await sb
    .from("clients")
    .update({ in_contact: 1, last_activity: newLast, updated_at: nowIso() })
    .eq("id", clientId)
    .eq("company_id", c);
  if (error) throw new Error(error.message);
}

export async function getClients(inContactFilter?: ClientsInContactFilter): Promise<Client[]> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const pageSize = 1000;
  const all: Client[] = [];
  let from = 0;
  const f = inContactFilter ?? "all";
  for (;;) {
    let q = sb.from("clients").select("*").eq("company_id", c).is("deleted_at", null);
    q = applyClientVisibilityReadFilter(q);
    q = applyInContactClientsFilter(q, f);
    const { data, error } = await q.order("id", { ascending: true }).range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as Client[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  let list = all;
  if (f === "not_contacted") {
    list = list.filter((x) => (x.in_contact ?? 0) !== 1);
  }
  return sortClientsList(list);
}

export async function searchClients(query: string, inContactFilter?: ClientsInContactFilter): Promise<Client[]> {
  if (!query.trim()) return getClients(inContactFilter);
  const term = query.trim();
  const sb = getSupabase();
  const c = requireCompanyId();
  const pageSize = 500;
  const all: (Client & {
    client_conversations?: { notes: string | null }[] | null;
    client_orders?: { description: string | null; documents: string | null }[] | null;
    client_custom_fields?: { field_name: string; field_value: string | null }[] | null;
    client_purchases?: { brand: string | null; model: string | null; note: string | null }[] | null;
  })[] = [];
  let from = 0;
  const f = inContactFilter ?? "all";
  for (;;) {
    let q = sb
      .from("clients")
      .select(
        `
      *,
      client_conversations (notes),
      client_orders (description, documents),
      client_custom_fields (field_name, field_value),
      client_purchases (brand, model, note)
    `
      )
      .eq("company_id", c)
      .is("deleted_at", null);
    q = applyClientVisibilityReadFilter(q);
    q = applyInContactClientsFilter(q, f);
    const { data, error } = await q.order("id", { ascending: true }).range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as typeof all;
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  let filtered = all.filter((r) => containsIgnoreCase(clientSearchTextFromRow(r), term));
  if (f === "not_contacted") {
    filtered = filtered.filter((r) => (r.in_contact ?? 0) !== 1);
  }
  const stripped: Client[] = filtered.map((r) => {
    const {
      client_conversations: _a,
      client_orders: _b,
      client_custom_fields: _c,
      client_purchases: _d,
      ...rest
    } = r;
    return rest as Client;
  });
  return sortClientsList(stripped);
}

export async function getClient(id: number): Promise<Client | null> {
  const sb = getSupabase();
  const c = requireCompanyId();
  let q = sb.from("clients").select("*").eq("id", id).eq("company_id", c).is("deleted_at", null);
  q = applyClientVisibilityReadFilter(q);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Client | null) ?? null;
}

/** Нормализация на ЕИК за сравнение с външни източници (само цифри). */
export function normalizeEikKey(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/\D/g, "");
}

export interface ClientEikLookupRow {
  id: number;
  name: string;
  eik: string | null;
  in_contact: number;
}

/**
 * Групова справка по ЕИК (видимостта за роля `clients` е като при списъка клиенти).
 * Ключът в Map е `normalizeEikKey`; стойността са всички съвпадащи клиенти (при дубликати по ЕИК).
 */
export async function lookupClientsByEiks(eiks: string[]): Promise<Map<string, ClientEikLookupRow[]>> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const variants = new Set<string>();
  for (const e of eiks) {
    const t = (e ?? "").trim();
    if (t) variants.add(t);
    const digits = normalizeEikKey(t);
    if (digits) variants.add(digits);
  }
  const list = [...variants];
  const result = new Map<string, ClientEikLookupRow[]>();
  if (list.length === 0) return result;

  const chunkSize = 100;
  const byId = new Map<number, ClientEikLookupRow>();
  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    let q = sb
      .from("clients")
      .select("id,name,eik,in_contact")
      .eq("company_id", c)
      .is("deleted_at", null)
      .in("eik", chunk);
    q = applyClientVisibilityReadFilter(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as ClientEikLookupRow[]) {
      byId.set(row.id, row);
    }
  }

  for (const row of byId.values()) {
    const key = normalizeEikKey(row.eik);
    if (!key) continue;
    const arr = result.get(key) ?? [];
    arr.push(row);
    result.set(key, arr);
  }
  return result;
}

export async function createClient(data: ClientDraft): Promise<number> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const role = getStoredRole();
  const staffId = getStaffUserId();
  const visibility_scope: ClientVisibilityScope =
    role === "clients" && staffId != null ? "staff_only" : "admin_only";
  const visible_to_staff_user_id =
    role === "clients" && staffId != null ? staffId : null;
  const created_by_staff_user_id = role === "clients" ? staffId : null;
  const { data: row, error } = await sb
    .from("clients")
    .insert({
      name: data.name,
      company: data.company ?? null,
      turnover: data.turnover ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      eik: data.eik ?? null,
      vat_number: data.vat_number ?? null,
      contact_person: data.contact_person ?? null,
      bank_account: data.bank_account ?? null,
      notes: data.notes ?? null,
      in_contact: data.in_contact ?? 0,
      visibility_scope,
      visible_to_staff_user_id,
      created_by_staff_user_id,
      company_id: c,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = row!.id as number;
  await logActivityEvent(id, "client_created", id, {
    client_name: data.name,
    company: data.company ?? null,
  });
  return id;
}

export async function createClientsBulk(items: ClientDraft[]): Promise<number> {
  if (items.length === 0) return 0;
  const sb = getSupabase();
  const c = requireCompanyId();
  const role = getStoredRole();
  const staffId = getStaffUserId();
  const visibility_scope: ClientVisibilityScope =
    role === "clients" && staffId != null ? "staff_only" : "admin_only";
  const visible_to_staff_user_id =
    role === "clients" && staffId != null ? staffId : null;
  const created_by_staff_user_id = role === "clients" ? staffId : null;

  const chunkSize = 150;
  let total = 0;
  for (let i = 0; i < items.length; i += chunkSize) {
    const slice = items.slice(i, i + chunkSize);
    const rows = slice.map((data) => ({
      name: data.name,
      company: data.company ?? null,
      turnover: data.turnover ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      eik: data.eik ?? null,
      vat_number: data.vat_number ?? null,
      contact_person: data.contact_person ?? null,
      bank_account: data.bank_account ?? null,
      notes: data.notes ?? null,
      in_contact: data.in_contact ?? 0,
      visibility_scope,
      visible_to_staff_user_id,
      created_by_staff_user_id,
      company_id: c,
    }));
    const { error } = await sb.from("clients").insert(rows);
    if (error) throw new Error(`${error.message} (редове ${i + 1}–${i + rows.length})`);
    total += rows.length;
  }
  return total;
}

export async function updateClientInContact(id: number, inContact: boolean): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb
    .from("clients")
    .update({ in_contact: inContact ? 1 : 0, updated_at: nowIso() })
    .eq("id", id)
    .eq("company_id", c);
  if (error) throw new Error(error.message);
  if (inContact) {
    await logActivityEvent(id, "contact", null);
  }
}

export async function updateClient(id: number, data: Partial<Client>): Promise<void> {
  const client = await getClient(id);
  if (!client) return;
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb
    .from("clients")
    .update({
      name: data.name ?? client.name,
      company: data.company ?? client.company,
      turnover: data.turnover !== undefined ? data.turnover : client.turnover,
      phone: data.phone ?? client.phone,
      email: data.email ?? client.email,
      address: data.address ?? client.address,
      eik: data.eik ?? client.eik,
      vat_number: data.vat_number ?? client.vat_number,
      contact_person: data.contact_person ?? client.contact_person,
      bank_account: data.bank_account ?? client.bank_account,
      notes: data.notes ?? client.notes,
      in_contact: data.in_contact ?? client.in_contact,
      updated_at: nowIso(),
    })
    .eq("id", id)
    .eq("company_id", c);
  if (error) throw new Error(error.message);
}

export async function deleteClient(id: number): Promise<void> {
  const cl = await getClient(id);
  if (!cl) return;
  await logActivityEvent(id, "client_deleted", null, {
    client_name: cl.name,
    company: cl.company,
  });
  const sb = getSupabase();
  const c = requireCompanyId();
  const role = getStoredRole();
  const actorStaffId = role === "clients" ? getStaffUserId() : null;
  const { error } = await sb
    .from("clients")
    .update({
      deleted_at: nowIso(),
      deleted_by_role: role ?? "admin",
      deleted_by_staff_user_id: actorStaffId,
      updated_at: nowIso(),
    })
    .eq("id", id)
    .eq("company_id", c)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
}

export async function listDeletedClients(): Promise<DeletedClient[]> {
  if (!isAdminRole()) throw new Error("Само админ може да вижда изтрити клиенти.");
  const sb = getSupabase();
  const c = requireCompanyId();
  const pageSize = 1000;
  const all: DeletedClient[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("clients")
      .select("*")
      .eq("company_id", c)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as DeletedClient[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export type ClientVisibilityTarget =
  | { scope: "everyone" }
  | { scope: "admin_only" }
  | { scope: "staff_only"; staffUserId: number };

export async function updateClientsVisibility(ids: number[], target: ClientVisibilityTarget): Promise<void> {
  if (!isAdminRole()) throw new Error("Само админ може да променя видимостта.");
  if (ids.length === 0) return;
  const sb = getSupabase();
  const c = requireCompanyId();
  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (target.scope === "staff_only") {
    patch.visibility_scope = "staff_only";
    patch.visible_to_staff_user_id = target.staffUserId;
  } else {
    patch.visibility_scope = target.scope;
    patch.visible_to_staff_user_id = null;
  }
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { error } = await sb
      .from("clients")
      .update(patch)
      .eq("company_id", c)
      .is("deleted_at", null)
      .in("id", chunk);
    if (error) throw new Error(error.message);
  }
}

export async function listConversationScripts(): Promise<ConversationScript[]> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb
    .from("conversation_scripts")
    .select("*")
    .eq("company_id", c)
    .eq("is_active", true)
    .order("machine_type", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ConversationScript[];
}

const CONVERSATION_TEXT_SCRIPTS_KEY = "conversation_text_scripts_v1";

async function getSettingValue(key: string): Promise<string | null> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb
    .from("settings")
    .select("value")
    .eq("company_id", c)
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.value as string | null | undefined) ?? null;
}

async function setSettingValue(key: string, value: string): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb.from("settings").upsert(
    { company_id: c, key, value },
    { onConflict: "company_id,key" }
  );
  if (error) throw new Error(error.message);
}

export async function listConversationTextScripts(): Promise<ConversationTextScript[]> {
  const raw = await getSettingValue(CONVERSATION_TEXT_SCRIPTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ConversationTextScript[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.id === "string" && typeof x.name === "string" && typeof x.content === "string")
      .sort((a, b) => a.name.localeCompare(b.name, "bg"));
  } catch {
    return [];
  }
}

export async function saveConversationTextScripts(items: ConversationTextScript[]): Promise<void> {
  const clean = items
    .map((x) => ({
      id: x.id,
      name: x.name.trim(),
      content: x.content,
      updated_at: x.updated_at || nowIso(),
    }))
    .filter((x) => x.id && x.name && x.content.trim());
  await setSettingValue(CONVERSATION_TEXT_SCRIPTS_KEY, JSON.stringify(clean));
}

export async function getConversationScriptSteps(scriptId: number): Promise<ConversationScriptStep[]> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb
    .from("conversation_script_steps")
    .select("*")
    .eq("company_id", c)
    .eq("script_id", scriptId)
    .order("step_no", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ConversationScriptStep[];
}

export async function listMachineCatalogItems(machineType?: string): Promise<MachineCatalogItem[]> {
  const sb = getSupabase();
  const c = requireCompanyId();
  let q = sb
    .from("machine_catalog_items")
    .select("*")
    .eq("company_id", c)
    .eq("is_active", true)
    .order("machine_type", { ascending: true })
    .order("model_name", { ascending: true });
  if (machineType?.trim()) q = q.eq("machine_type", machineType.trim());
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as MachineCatalogItem[];
}

export async function listMachineSellingPoints(machineType?: string): Promise<MachineSellingPoint[]> {
  const sb = getSupabase();
  const c = requireCompanyId();
  let q = sb
    .from("machine_selling_points")
    .select("*")
    .eq("company_id", c)
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .order("id", { ascending: true });
  if (machineType?.trim()) q = q.eq("machine_type", machineType.trim());
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as MachineSellingPoint[];
}

export async function upsertConversationScript(
  script: {
    script_code: string;
    name: string;
    machine_type: string;
    is_active?: boolean;
  },
  steps: Array<{
    step_no: number;
    step_type: "question" | "info" | "selling_point";
    question: string;
    answer_type?: "text" | "number" | "date" | "yes_no" | "choice";
    required?: boolean;
  }>
): Promise<number> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const code = script.script_code.trim();
  if (!code) throw new Error("Липсва script_code.");
  const { data: row, error } = await sb
    .from("conversation_scripts")
    .upsert(
      {
        company_id: c,
        script_code: code,
        name: script.name.trim(),
        machine_type: script.machine_type.trim(),
        is_active: script.is_active ?? true,
        updated_at: nowIso(),
      },
      { onConflict: "company_id,script_code" }
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const scriptId = row!.id as number;

  const { error: delErr } = await sb
    .from("conversation_script_steps")
    .delete()
    .eq("company_id", c)
    .eq("script_id", scriptId);
  if (delErr) throw new Error(delErr.message);

  if (steps.length > 0) {
    const payload = steps.map((s) => ({
      company_id: c,
      script_id: scriptId,
      step_no: s.step_no,
      step_type: s.step_type,
      question: s.question.trim(),
      answer_type: s.answer_type ?? "text",
      required: s.required ?? false,
    }));
    const { error: insErr } = await sb.from("conversation_script_steps").insert(payload);
    if (insErr) throw new Error(insErr.message);
  }
  return scriptId;
}

export async function upsertMachineCatalogItem(item: {
  machine_code: string;
  machine_type: string;
  model_name: string;
  price_eur?: number | null;
  specs?: string | null;
  features?: string | null;
  is_active?: boolean;
}): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const code = item.machine_code.trim();
  if (!code) throw new Error("Липсва machine_code.");
  const { error } = await sb.from("machine_catalog_items").upsert(
    {
      company_id: c,
      machine_code: code,
      machine_type: item.machine_type.trim(),
      model_name: item.model_name.trim(),
      price_eur: item.price_eur ?? null,
      specs: item.specs ?? null,
      features: item.features ?? null,
      is_active: item.is_active ?? true,
      updated_at: nowIso(),
    },
    { onConflict: "company_id,machine_code" }
  );
  if (error) throw new Error(error.message);
}

export async function replaceMachineSellingPoints(
  machineType: string,
  rows: Array<{ priority: number; text: string; is_active?: boolean }>
): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const mt = machineType.trim();
  if (!mt) throw new Error("Липсва machine_type.");
  const { error: delErr } = await sb
    .from("machine_selling_points")
    .delete()
    .eq("company_id", c)
    .eq("machine_type", mt);
  if (delErr) throw new Error(delErr.message);
  if (rows.length === 0) return;
  const payload = rows.map((r) => ({
    company_id: c,
    machine_type: mt,
    priority: r.priority,
    text: r.text.trim(),
    is_active: r.is_active ?? true,
  }));
  const { error } = await sb.from("machine_selling_points").insert(payload);
  if (error) throw new Error(error.message);
}

// Client custom fields
export interface CustomField {
  id: number;
  field_name: string;
  field_value: string | null;
  created_at: string | null;
}

export async function getClientCustomFields(clientId: number): Promise<CustomField[]> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb
    .from("client_custom_fields")
    .select("id, field_name, field_value, created_at")
    .eq("client_id", clientId)
    .eq("company_id", c)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CustomField[];
}

export async function setClientCustomField(clientId: number, fieldName: string, fieldValue: string): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb.from("client_custom_fields").upsert(
    { client_id: clientId, field_name: fieldName, field_value: fieldValue, company_id: c },
    { onConflict: "client_id,field_name" }
  );
  if (error) throw new Error(error.message);
}

export async function deleteClientCustomField(id: number): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb.from("client_custom_fields").delete().eq("id", id).eq("company_id", c);
  if (error) throw new Error(error.message);
}

// Client conversations
export interface Conversation {
  id: number;
  client_id: number;
  date: string;
  type: "phone" | "in_person";
  notes: string | null;
  script_id: number | null;
  machine_catalog_item_id: number | null;
  machine_type: string | null;
  script_answers: Record<string, string> | null;
  script_snapshot: Record<string, unknown> | null;
  machine_snapshot: Record<string, unknown> | null;
  selling_points_snapshot: unknown[] | null;
  created_at: string;
}

export async function getClientConversations(clientId: number): Promise<Conversation[]> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb
    .from("client_conversations")
    .select("*")
    .eq("client_id", clientId)
    .eq("company_id", c)
    .order("date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Conversation[];
}

export async function addConversation(
  clientId: number,
  date: string,
  type: "phone" | "in_person",
  notes: string,
  extras?: {
    script_id?: number | null;
    machine_catalog_item_id?: number | null;
    machine_type?: string | null;
    script_answers?: Record<string, string> | null;
    script_snapshot?: Record<string, unknown> | null;
    machine_snapshot?: Record<string, unknown> | null;
    selling_points_snapshot?: unknown[] | null;
  }
): Promise<number> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data: row, error } = await sb
    .from("client_conversations")
    .insert({
      client_id: clientId,
      date,
      type,
      notes,
      company_id: c,
      script_id: extras?.script_id ?? null,
      machine_catalog_item_id: extras?.machine_catalog_item_id ?? null,
      machine_type: extras?.machine_type ?? null,
      script_answers: extras?.script_answers ?? null,
      script_snapshot: extras?.script_snapshot ?? null,
      machine_snapshot: extras?.machine_snapshot ?? null,
      selling_points_snapshot: extras?.selling_points_snapshot ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const convId = row!.id as number;
  await updateClientActivity(clientId);
  await logActivityEvent(clientId, "conversation", convId);
  return convId;
}

export async function updateConversation(
  id: number,
  data: {
    date?: string;
    type?: "phone" | "in_person";
    notes?: string;
    script_id?: number | null;
    machine_catalog_item_id?: number | null;
    machine_type?: string | null;
    script_answers?: Record<string, string> | null;
    script_snapshot?: Record<string, unknown> | null;
    machine_snapshot?: Record<string, unknown> | null;
    selling_points_snapshot?: unknown[] | null;
  }
): Promise<void> {
  const sb = getSupabase();
  const co = requireCompanyId();
  const { data: rows, error: fErr } = await sb
    .from("client_conversations")
    .select("*")
    .eq("id", id)
    .eq("company_id", co)
    .maybeSingle();
  if (fErr) throw new Error(fErr.message);
  if (!rows) return;
  const c = rows as Conversation;
  const { error } = await sb
    .from("client_conversations")
    .update({
      date: data.date ?? c.date,
      type: data.type ?? c.type,
      notes: data.notes ?? c.notes ?? "",
      script_id: data.script_id !== undefined ? data.script_id : c.script_id,
      machine_catalog_item_id:
        data.machine_catalog_item_id !== undefined ? data.machine_catalog_item_id : c.machine_catalog_item_id,
      machine_type: data.machine_type !== undefined ? data.machine_type : c.machine_type,
      script_answers: data.script_answers !== undefined ? data.script_answers : c.script_answers,
      script_snapshot: data.script_snapshot !== undefined ? data.script_snapshot : c.script_snapshot,
      machine_snapshot: data.machine_snapshot !== undefined ? data.machine_snapshot : c.machine_snapshot,
      selling_points_snapshot:
        data.selling_points_snapshot !== undefined ? data.selling_points_snapshot : c.selling_points_snapshot,
    })
    .eq("id", id)
    .eq("company_id", co);
  if (error) throw new Error(error.message);
  await updateClientActivity(c.client_id);
}

export async function deleteConversation(id: number): Promise<void> {
  const sb = getSupabase();
  const co = requireCompanyId();
  const { data: row, error: fErr } = await sb
    .from("client_conversations")
    .select("*")
    .eq("id", id)
    .eq("company_id", co)
    .maybeSingle();
  if (fErr) throw new Error(fErr.message);
  if (!row) return;
  const c = row as Conversation;
  await logActivityEvent(c.client_id, "conversation_deleted", id, {
    preview: (c.notes ?? "").slice(0, 200),
  });
  const { error } = await sb.from("client_conversations").delete().eq("id", id).eq("company_id", co);
  if (error) throw new Error(error.message);
}

/** Начало/край на локалния календарен ден като ISO (за напомняния и брояч). */
export function localDayRangeUtcIso(d = new Date()): { startIso: string; endIso: string } {
  const y = d.getFullYear();
  const mo = d.getMonth();
  const day = d.getDate();
  const start = new Date(y, mo, day, 0, 0, 0, 0);
  const end = new Date(y, mo, day + 1, 0, 0, 0, 0);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** Закръгляване към най-близките 0 или 30 мин по локално време. */
export function roundLocalDateTimeTo30Minutes(isoOrDatetimeLocal: string): string {
  const d = new Date(isoOrDatetimeLocal);
  if (Number.isNaN(d.getTime())) throw new Error("Невалидна дата/час.");
  d.setSeconds(0, 0);
  const totalMin = d.getHours() * 60 + d.getMinutes();
  const rounded = Math.round(totalMin / 30) * 30;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export interface ConversationReminder {
  id: number;
  company_id: number;
  client_id: number;
  conversation_id: number;
  remind_at: string;
  done_at: string | null;
  owner_staff_user_id: number | null;
  created_at: string;
  updated_at: string;
  clients?: { name: string } | null;
  client_conversations?: { notes: string | null; date: string; type: string } | null;
}

export async function createConversationReminder(params: {
  clientId: number;
  conversationId: number;
  /** datetime-local или ISO */
  remindAtInput: string;
}): Promise<number> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { clientId, conversationId, remindAtInput } = params;
  const { data: conv, error: cErr } = await sb
    .from("client_conversations")
    .select("id, client_id, company_id")
    .eq("id", conversationId)
    .eq("company_id", c)
    .maybeSingle();
  if (cErr) throw new Error(cErr.message);
  if (!conv || (conv as { client_id: number }).client_id !== clientId) {
    throw new Error("Разговорът не е намерен или не принадлежи на клиента.");
  }
  const remind_at = roundLocalDateTimeTo30Minutes(remindAtInput);
  const role = getStoredRole();
  const staffId = getStaffUserId();
  const owner_staff_user_id = role === "clients" && staffId != null ? staffId : null;
  const { data: ins, error } = await sb
    .from("conversation_reminders")
    .insert({
      company_id: c,
      client_id: clientId,
      conversation_id: conversationId,
      remind_at,
      owner_staff_user_id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return ins!.id as number;
}

export async function markConversationReminderDone(id: number): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const role = getStoredRole();
  const staffId = getStaffUserId();
  let q = sb.from("conversation_reminders").update({ done_at: nowIso(), updated_at: nowIso() }).eq("id", id).eq("company_id", c);
  if (role === "clients" && staffId != null) {
    q = q.eq("owner_staff_user_id", staffId);
  }
  const { error } = await q;
  if (error) throw new Error(error.message);
}

/** Незавършени напомняния за локалния „днес“ (включително часът е минал, но не е DONE). */
export async function countTodayPendingReminders(): Promise<number> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { startIso, endIso } = localDayRangeUtcIso();
  const role = getStoredRole();
  const staffId = getStaffUserId();
  let q = sb
    .from("conversation_reminders")
    .select("*", { count: "exact", head: true })
    .eq("company_id", c)
    .is("done_at", null)
    .gte("remind_at", startIso)
    .lt("remind_at", endIso);
  if (role === "clients" && staffId != null) {
    q = q.eq("owner_staff_user_id", staffId);
  }
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function listConversationReminders(): Promise<{
  upcoming: ConversationReminder[];
  past: ConversationReminder[];
}> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const role = getStoredRole();
  const staffId = getStaffUserId();
  let base = sb
    .from("conversation_reminders")
    .select(
      "id, company_id, client_id, conversation_id, remind_at, done_at, owner_staff_user_id, created_at, updated_at, clients(name), client_conversations(notes, date, type)"
    )
    .eq("company_id", c)
    .order("remind_at", { ascending: true });
  if (role === "clients" && staffId != null) {
    base = base.eq("owner_staff_user_id", staffId);
  }
  const { data, error } = await base;
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((raw: Record<string, unknown>) => {
    const clients = raw["clients"];
    const conv = raw["client_conversations"];
    return {
      ...raw,
      clients: Array.isArray(clients) ? (clients[0] as { name: string } | undefined) ?? null : (clients as { name: string } | null),
      client_conversations: Array.isArray(conv)
        ? (conv[0] as { notes: string | null; date: string; type: string } | undefined) ?? null
        : (conv as { notes: string | null; date: string; type: string } | null),
    } as ConversationReminder;
  });
  const todayKey = localDayKeyFromIso(new Date().toISOString());
  const upcoming: ConversationReminder[] = [];
  const past: ConversationReminder[] = [];
  for (const r of rows) {
    const isDone = r.done_at != null;
    const dayKey = localDayKeyFromIso(r.remind_at);
    if (!isDone && dayKey >= todayKey) {
      upcoming.push(r);
    } else {
      past.push(r);
    }
  }
  upcoming.sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime());
  past.sort((a, b) => {
    const da = a.done_at ?? a.remind_at;
    const db = b.done_at ?? b.remind_at;
    return new Date(db).getTime() - new Date(da).getTime();
  });
  return { upcoming, past };
}

// Client meetings (уговорени срещи)
export interface ClientMeeting {
  id: number;
  client_id: number;
  scheduled_at: string;
  meeting_address: string | null;
  contact_person: string | null;
  phone: string | null;
  outcome_notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function getClientMeetings(clientId: number): Promise<ClientMeeting[]> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb
    .from("client_meetings")
    .select("*")
    .eq("client_id", clientId)
    .eq("company_id", c)
    .order("scheduled_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ClientMeeting[];
}

export async function addClientMeeting(
  clientId: number,
  scheduledAt: string,
  outcomeNotes?: string | null,
  opts?: {
    meeting_address?: string | null;
    contact_person?: string | null;
    phone?: string | null;
  }
): Promise<number> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data: row, error } = await sb
    .from("client_meetings")
    .insert({
      client_id: clientId,
      scheduled_at: scheduledAt,
      outcome_notes: outcomeNotes ?? null,
      meeting_address: opts?.meeting_address?.trim() || null,
      contact_person: opts?.contact_person?.trim() || null,
      phone: opts?.phone?.trim() || null,
      company_id: c,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = row!.id as number;
  await logActivityEvent(clientId, "meeting", id, { scheduled_at: scheduledAt });
  return id;
}

export async function updateClientMeeting(
  id: number,
  data: Partial<
    Pick<
      ClientMeeting,
      "scheduled_at" | "outcome_notes" | "meeting_address" | "contact_person" | "phone"
    >
  >
): Promise<void> {
  const sb = getSupabase();
  const co = requireCompanyId();
  const { data: cur, error: fErr } = await sb
    .from("client_meetings")
    .select("*")
    .eq("id", id)
    .eq("company_id", co)
    .maybeSingle();
  if (fErr) throw new Error(fErr.message);
  if (!cur) return;
  const c = cur as ClientMeeting;
  const { error } = await sb
    .from("client_meetings")
    .update({
      scheduled_at: data.scheduled_at ?? c.scheduled_at,
      outcome_notes: data.outcome_notes !== undefined ? data.outcome_notes : c.outcome_notes,
      meeting_address:
        data.meeting_address !== undefined ? data.meeting_address : c.meeting_address,
      contact_person:
        data.contact_person !== undefined ? data.contact_person : c.contact_person,
      phone: data.phone !== undefined ? data.phone : c.phone,
      updated_at: nowIso(),
    })
    .eq("id", id)
    .eq("company_id", co);
  if (error) throw new Error(error.message);
  await logActivityEvent(c.client_id, "meeting", id, { scheduled_at: data.scheduled_at ?? c.scheduled_at });
}

export async function deleteClientMeeting(id: number): Promise<void> {
  const sb = getSupabase();
  const co = requireCompanyId();
  const { data: row, error: fErr } = await sb
    .from("client_meetings")
    .select("*")
    .eq("id", id)
    .eq("company_id", co)
    .maybeSingle();
  if (fErr) throw new Error(fErr.message);
  if (!row) return;
  const m = row as ClientMeeting;
  await logActivityEvent(m.client_id, "meeting_deleted", id, {
    scheduled_at: m.scheduled_at,
  });
  const { error } = await sb.from("client_meetings").delete().eq("id", id).eq("company_id", co);
  if (error) throw new Error(error.message);
}

/** Ред за екрана Статистика: един ред на клиент на календарен ден. */
export interface StatisticAggregatedRow {
  dayKey: string;
  clientId: number;
  clientName: string;
  company: string | null;
  /** Има ли още клиент в базата (за бутон „Отвори картон“). */
  clientExists: boolean;
  /** Регистрирано е създаване на клиента в този ден (от лога). */
  clientCreated: boolean;
  hasContact: boolean;
  conversationCount: number;
  meetings: { id: number; scheduledAt: string; isUpcoming: boolean }[];
  /** Добавени поръчки за деня (описание + сума EUR). */
  orders: { description: string | null; amount: number | null }[];
  /** Изтрити елементи и др. */
  deletionLabels: string[];
  /** Най-късно `occurred_at` сред събитията за този ред (ден + клиент). */
  lastOccurredAt: string;
  /** Текст за търсене: бележки от разговори/срещи, поръчки, метаданни и др. */
  searchText: string;
  /** Уникални етикети на автори за събитията в този ред (ден + клиент). */
  actorLabels: string[];
  /** Инициали (главни букви), същия ред като actorLabels. */
  actorInitials: string[];
}

/** Обобщение за календарен ден по автор (за блока над списъка в Статистика). */
export interface StatisticsDayActorSummary {
  dayKey: string;
  /** Стабилен ключ за UI (служител, админ по подразбиране, или именуван алтернативен PIN). */
  actorKey: string;
  actorLabel: string;
  actorInitials: string;
  newClients: number;
  contacts: number;
  conversations: number;
  meetings: number;
  orders: number;
  deletions: number;
}

export type StatisticsFetchResult = {
  rows: StatisticAggregatedRow[];
  daySummaries: StatisticsDayActorSummary[];
};

export type StatisticsDaySummariesResult = {
  daySummaries: StatisticsDayActorSummary[];
  dayKeys: string[];
};

function metaStr(m: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = m?.[key];
  return typeof v === "string" ? v : null;
}

/** Филтър по автор за статистиката (админ: всички / без акаунт / конкретен служител). */
export type StatisticsActorFilter =
  | { scope: "all" }
  | { scope: "legacy" }
  | { scope: "staff"; staffUserId: number };

export interface DayConversationRow {
  id: number;
  dayKey: string;
  occurredAt: string;
  clientId: number;
  clientName: string;
  clientCompany: string | null;
  actorLabel: string;
  actorInitials: string;
  type: string;
  notes: string | null;
}

function localDayRangeIso(dayKey: string): { fromIso: string; toIso: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) {
    throw new Error("Невалиден ден.");
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const from = new Date(y, mo - 1, d, 0, 0, 0, 0);
  const to = new Date(y, mo - 1, d + 1, 0, 0, 0, 0);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

/** PostgREST връща 400 Bad Request при твърде дълъг URL — `.in("id", [...])` с хиляди id. */
const STATS_IN_QUERY_CHUNK = 100;

type StatsEventsFetchOptions = {
  /**
   * Само за RXG: изключва стари `client_created` (масов импорт), за да не се теглят хиляди реда.
   * Останалите типове събития са без ограничение по време.
   */
  rxgClientCreatedCutoffMs: number | null;
};

/** Зарежда всички събития за статистиката (без горен лимит — старите дни не се губят). */
async function fetchAllActivityEventsForStats(
  sb: ReturnType<typeof getSupabase>,
  actorFilter?: StatisticsActorFilter,
  fetchOpts?: StatsEventsFetchOptions
): Promise<
  {
    id: number;
    client_id: number | null;
    occurred_at: string;
    event_type: string;
    ref_id: number | null;
    metadata: Record<string, unknown> | null;
    actor_user_id: number | null;
  }[]
> {
  const pageSize = 1000;
  const all: {
    id: number;
    client_id: number | null;
    occurred_at: string;
    event_type: string;
    ref_id: number | null;
    metadata: Record<string, unknown> | null;
    actor_user_id: number | null;
  }[] = [];
  let from = 0;
  const comp = requireCompanyId();
  const rxgCut = fetchOpts?.rxgClientCreatedCutoffMs;
  for (;;) {
    let q = sb
      .from("client_activity_events")
      .select("id, client_id, occurred_at, event_type, ref_id, metadata, actor_user_id")
      .eq("company_id", comp)
      .order("id", { ascending: true });
    if (rxgCut != null) {
      const iso = new Date(rxgCut).toISOString();
      q = q.or(`event_type.neq.client_created,and(event_type.eq.client_created,occurred_at.gte."${iso}")`);
    }
    if (actorFilter?.scope === "legacy") {
      q = q.is("actor_user_id", null);
    } else if (actorFilter?.scope === "staff") {
      q = q.eq("actor_user_id", actorFilter.staffUserId);
    }
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    if (batch.length === 0) break;
    all.push(...(batch as typeof all));
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function fetchActivityEventsForStatsDay(
  sb: ReturnType<typeof getSupabase>,
  dayKey: string,
  actorFilter?: StatisticsActorFilter
): Promise<
  {
    id: number;
    client_id: number | null;
    occurred_at: string;
    event_type: string;
    ref_id: number | null;
    metadata: Record<string, unknown> | null;
    actor_user_id: number | null;
  }[]
> {
  const comp = requireCompanyId();
  const { fromIso, toIso } = localDayRangeIso(dayKey);
  const pageSize = 1000;
  const all: {
    id: number;
    client_id: number | null;
    occurred_at: string;
    event_type: string;
    ref_id: number | null;
    metadata: Record<string, unknown> | null;
    actor_user_id: number | null;
  }[] = [];
  let from = 0;
  for (;;) {
    let q = sb
      .from("client_activity_events")
      .select("id, client_id, occurred_at, event_type, ref_id, metadata, actor_user_id")
      .eq("company_id", comp)
      .gte("occurred_at", fromIso)
      .lt("occurred_at", toIso)
      .order("id", { ascending: true });
    if (actorFilter?.scope === "legacy") {
      q = q.is("actor_user_id", null);
    } else if (actorFilter?.scope === "staff") {
      q = q.eq("actor_user_id", actorFilter.staffUserId);
    }
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    if (batch.length === 0) break;
    all.push(...(batch as typeof all));
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export async function fetchStatisticsRows(actorFilter?: StatisticsActorFilter): Promise<StatisticsFetchResult> {
  const sb = getSupabase();
  const orgLower = statsOrgCodeLower();
  const rxgClientCreatedCutoffMs = orgLower === "rxg" ? startOfCurrentLocalHourMs() : null;
  const eventsRaw = await fetchAllActivityEventsForStats(sb, actorFilter, { rxgClientCreatedCutoffMs });

  type Ev = {
    id: number;
    client_id: number | null;
    occurred_at: string;
    event_type: string;
    ref_id: number | null;
    metadata: Record<string, unknown> | null;
    actor_user_id: number | null;
  };
  if (!eventsRaw.length) return { rows: [], daySummaries: [] };

  /** BTX2026 и др.: всички `client_created`. RXG: само от началото на текущия локален час (импортът е извън прозореца). */
  const list = (eventsRaw as Ev[]).filter((e) => {
    if (e.event_type !== "client_created") return true;
    if (rxgClientCreatedCutoffMs == null) return true;
    return new Date(e.occurred_at).getTime() >= rxgClientCreatedCutoffMs;
  });
  if (!list.length) return { rows: [], daySummaries: [] };

  const compC = requireCompanyId();

  const actorIdsForLabels = [...new Set(list.map((e) => e.actor_user_id).filter((x): x is number => x != null))];
  const staffById = new Map<number, { username: string; display_name: string | null }>();
  if (actorIdsForLabels.length > 0) {
    for (let i = 0; i < actorIdsForLabels.length; i += STATS_IN_QUERY_CHUNK) {
      const slice = actorIdsForLabels.slice(i, i + STATS_IN_QUERY_CHUNK);
      const { data: staffRows, error: sErr } = await sb
        .from("staff_users")
        .select("id, username, display_name")
        .eq("company_id", compC)
        .in("id", slice);
      if (sErr) throw new Error(sErr.message);
      for (const s of staffRows ?? []) {
        const row = s as { id: number; username: string; display_name: string | null };
        staffById.set(row.id, { username: row.username, display_name: row.display_name });
      }
    }
  }

  const statsActorLabel = (actorId: number | null): string => {
    if (actorId == null) return "Админ / без акаунт";
    const s = staffById.get(actorId);
    if (!s) return `Служител #${actorId}`;
    return s.display_name ? `${s.display_name} (${s.username})` : s.username;
  };

  const statsActorInitials = (actorId: number | null): string => {
    if (actorId == null) return "АД";
    const s = staffById.get(actorId);
    if (!s) {
      const idStr = String(actorId);
      return idStr.length >= 2 ? idStr.slice(0, 2).toUpperCase() : `${idStr}?`.toUpperCase();
    }
    const dn = s.display_name?.trim();
    if (dn) {
      const parts = dn.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        const a = parts[0]!.charAt(0);
        const b = parts[1]!.charAt(0);
        return (a + b).toUpperCase();
      }
      if (parts.length === 1) {
        const p = parts[0]!;
        if (p.length >= 2) return p.slice(0, 2).toUpperCase();
        return (p.charAt(0) + (s.username.charAt(0) || "?")).toUpperCase();
      }
    }
    const u = s.username.trim();
    if (u.length >= 2) return u.slice(0, 2).toUpperCase();
    return u.charAt(0).toUpperCase() + (u.charAt(1)?.toUpperCase() ?? "");
  };

  const eventActorKeyFromEv = (e: Ev): string => {
    if (e.actor_user_id != null) return `s\t${e.actor_user_id}`;
    const lab = metaStr(e.metadata, "admin_actor_label");
    const ini = metaStr(e.metadata, "admin_actor_initials");
    if (lab) return `a\tnamed\t${lab}\t${ini ?? ""}`;
    return "a\tdef";
  };

  const labelInitialsForActorKey = (key: string): { label: string; initials: string } => {
    const parts = key.split("\t");
    if (parts[0] === "s" && parts[1]) {
      const id = parseInt(parts[1], 10);
      if (Number.isFinite(id)) {
        return { label: statsActorLabel(id), initials: statsActorInitials(id) };
      }
    }
    if (parts[0] === "a" && parts[1] === "def") {
      return { label: "Админ / без акаунт", initials: "АД" };
    }
    if (parts[0] === "a" && parts[1] === "named" && parts[2]) {
      const label = parts[2]!;
      const ini = (parts[3] ?? "").trim();
      if (ini) return { label, initials: ini };
      return { label, initials: initialsFromFullName(label) };
    }
    return { label: "?", initials: "?" };
  };

  type DayAcc = {
    dayKey: string;
    actorKey: string;
    newClients: number;
    contacts: number;
    conversations: number;
    meetings: number;
    orders: number;
    deletions: number;
  };
  const dayAccKey = (dayKey: string, e: Ev) => `${dayKey}\t${eventActorKeyFromEv(e)}`;
  const dayAcc = new Map<string, DayAcc>();
  for (const e of list) {
    const dk = localDayKeyFromIso(e.occurred_at);
    const k = dayAccKey(dk, e);
    let a = dayAcc.get(k);
    if (!a) {
      a = {
        dayKey: dk,
        actorKey: eventActorKeyFromEv(e),
        newClients: 0,
        contacts: 0,
        conversations: 0,
        meetings: 0,
        orders: 0,
        deletions: 0,
      };
      dayAcc.set(k, a);
    }
    switch (e.event_type) {
      case "client_created":
        a.newClients++;
        break;
      case "contact":
        a.contacts++;
        break;
      case "conversation":
        a.conversations++;
        break;
      case "meeting":
        a.meetings++;
        break;
      case "order":
        a.orders++;
        break;
      case "conversation_deleted":
      case "meeting_deleted":
      case "order_deleted":
      case "client_deleted":
        a.deletions++;
        break;
      default:
        break;
    }
  }

  const daySummaries: StatisticsDayActorSummary[] = [...dayAcc.values()]
    .map((a) => {
      const { label, initials } = labelInitialsForActorKey(a.actorKey);
      return {
        dayKey: a.dayKey,
        actorKey: a.actorKey,
        actorLabel: label,
        actorInitials: initials,
        newClients: a.newClients,
        contacts: a.contacts,
        conversations: a.conversations,
        meetings: a.meetings,
        orders: a.orders,
        deletions: a.deletions,
      };
    })
    .filter(
      (s) =>
        s.newClients + s.contacts + s.conversations + s.meetings + s.orders + s.deletions > 0
    )
    .sort((x, y) => {
      if (x.dayKey !== y.dayKey) return y.dayKey.localeCompare(x.dayKey);
      return x.actorLabel.localeCompare(y.actorLabel, "bg");
    });

  const clientIds = [...new Set(list.map((e) => e.client_id).filter((x): x is number => x != null))];
  const clientMap = new Map<number, { name: string; company: string | null }>();
  if (clientIds.length > 0) {
    for (let i = 0; i < clientIds.length; i += STATS_IN_QUERY_CHUNK) {
      const slice = clientIds.slice(i, i + STATS_IN_QUERY_CHUNK);
      const { data: clientRows, error: cErr } = await sb
        .from("clients")
        .select("id, name, company")
        .eq("company_id", compC)
        .in("id", slice);
      if (cErr) throw new Error(cErr.message);
      for (const c of clientRows ?? []) {
        const row = c as { id: number; name: string; company: string | null };
        clientMap.set(row.id, { name: row.name, company: row.company });
      }
    }
  }

  const meetingIds = new Set<number>();
  const orderIds = new Set<number>();
  const conversationIds = new Set<number>();
  for (const e of list) {
    if (e.event_type === "meeting" && e.ref_id != null) meetingIds.add(e.ref_id);
    if (e.event_type === "order" && e.ref_id != null) orderIds.add(e.ref_id);
    if (e.event_type === "conversation" && e.ref_id != null) conversationIds.add(e.ref_id);
  }

  type MeetingDetailRow = {
    id: number;
    scheduled_at: string;
    outcome_notes: string | null;
    meeting_address: string | null;
    contact_person: string | null;
    phone: string | null;
  };
  const meetingDetailMap = new Map<number, MeetingDetailRow>();
  if (meetingIds.size > 0) {
    const mids = [...meetingIds];
    for (let i = 0; i < mids.length; i += STATS_IN_QUERY_CHUNK) {
      const slice = mids.slice(i, i + STATS_IN_QUERY_CHUNK);
      const { data: mrows, error: mErr } = await sb
        .from("client_meetings")
        .select("id, scheduled_at, outcome_notes, meeting_address, contact_person, phone")
        .eq("company_id", compC)
        .in("id", slice);
      if (mErr) throw new Error(mErr.message);
      for (const m of mrows ?? []) {
        const row = m as MeetingDetailRow;
        meetingDetailMap.set(row.id, row);
      }
    }
  }

  const conversationNotesMap = new Map<number, string>();
  if (conversationIds.size > 0) {
    const cids = [...conversationIds];
    for (let i = 0; i < cids.length; i += STATS_IN_QUERY_CHUNK) {
      const slice = cids.slice(i, i + STATS_IN_QUERY_CHUNK);
      const { data: crows, error: convErr } = await sb
        .from("client_conversations")
        .select("id, notes")
        .eq("company_id", compC)
        .in("id", slice);
      if (convErr) throw new Error(convErr.message);
      for (const c of crows ?? []) {
        const row = c as { id: number; notes: string | null };
        conversationNotesMap.set(row.id, row.notes ?? "");
      }
    }
  }

  const orderMap = new Map<number, { description: string | null; amount: number | null; documents: string | null }>();
  if (orderIds.size > 0) {
    const oids = [...orderIds];
    for (let i = 0; i < oids.length; i += STATS_IN_QUERY_CHUNK) {
      const slice = oids.slice(i, i + STATS_IN_QUERY_CHUNK);
      const { data: orows, error: oErr } = await sb
        .from("client_orders")
        .select("id, description, amount, documents")
        .eq("company_id", compC)
        .in("id", slice);
      if (oErr) throw new Error(oErr.message);
      for (const o of orows ?? []) {
        const row = o as { id: number; description: string | null; amount: number | null; documents: string | null };
        orderMap.set(row.id, { description: row.description, amount: row.amount, documents: row.documents });
      }
    }
  }

  const now = Date.now();
  type G = {
    dayKey: string;
    clientId: number;
    clientName: string;
    company: string | null;
    clientCreated: boolean;
    hasContact: boolean;
    conversationCount: number;
    meetingIdSet: Set<number>;
    orderSnapshots: { description: string | null; amount: number | null }[];
    deletionLabels: string[];
    lastOccurredAt: string;
    searchTextParts: string[];
    actorKeySet: Set<string>;
  };
  const groups = new Map<string, G>();

  const resolveClientLabel = (e: Ev): { name: string; company: string | null } => {
    const cid = e.client_id;
    const m = e.metadata ?? {};
    if (cid != null && clientMap.has(cid)) {
      const c = clientMap.get(cid)!;
      return { name: c.name, company: c.company };
    }
    if (cid != null) {
      return {
        name: metaStr(m, "client_name") ?? `#${cid}`,
        company: (m.company as string) ?? null,
      };
    }
    return {
      name: metaStr(m, "client_name") ?? "?",
      company: (m.company as string) ?? null,
    };
  };

  for (const e of list) {
    const dayKey = localDayKeyFromIso(e.occurred_at);
    const { name: rName, company: rCompany } = resolveClientLabel(e);
    const key = `${dayKey}|${e.client_id ?? `orphan-${e.id}`}`;

    let g = groups.get(key);
    if (!g) {
      g = {
        dayKey,
        clientId: e.client_id ?? -1,
        clientName: rName,
        company: rCompany,
        clientCreated: false,
        hasContact: false,
        conversationCount: 0,
        meetingIdSet: new Set(),
        orderSnapshots: [],
        deletionLabels: [],
        lastOccurredAt: e.occurred_at,
        searchTextParts: [],
        actorKeySet: new Set(),
      };
      groups.set(key, g);
    } else if (e.occurred_at > g.lastOccurredAt) {
      g.lastOccurredAt = e.occurred_at;
    }

    g.actorKeySet.add(eventActorKeyFromEv(e));

    const m = e.metadata ?? {};

    switch (e.event_type) {
      case "client_created":
        g.clientCreated = true;
        break;
      case "contact":
        g.hasContact = true;
        break;
      case "conversation":
        g.conversationCount += 1;
        if (e.ref_id != null) {
          const notes = conversationNotesMap.get(e.ref_id);
          if (notes?.trim()) g.searchTextParts.push(notes);
        }
        break;
      case "meeting":
        if (e.ref_id != null) {
          g.meetingIdSet.add(e.ref_id);
          const md = meetingDetailMap.get(e.ref_id);
          if (md) {
            const blob = [md.outcome_notes, md.meeting_address, md.contact_person, md.phone].filter(Boolean).join(" ");
            if (blob) g.searchTextParts.push(blob);
          }
        }
        break;
      case "order": {
        let desc: string | null = (m.description as string) ?? null;
        let amt: number | null = typeof m.amount === "number" ? m.amount : (m.amount as number | null) ?? null;
        if (e.ref_id != null && orderMap.has(e.ref_id)) {
          const o = orderMap.get(e.ref_id)!;
          desc = desc ?? o.description;
          amt = amt ?? o.amount;
          const oSearch = [o.description, o.documents, o.amount != null ? String(o.amount) : ""].filter(Boolean).join(" ");
          if (oSearch) g.searchTextParts.push(oSearch);
        } else {
          const fallback = [desc, amt != null ? String(amt) : ""].filter(Boolean).join(" ");
          if (fallback) g.searchTextParts.push(fallback);
        }
        g.orderSnapshots.push({ description: desc, amount: amt });
        break;
      }
      case "conversation_deleted":
        g.deletionLabels.push("изтрит разговор");
        {
          const pv = metaStr(m, "preview");
          if (pv) g.searchTextParts.push(pv);
        }
        break;
      case "meeting_deleted": {
        const s = metaStr(m, "scheduled_at");
        g.deletionLabels.push(s ? `изтрита среща (${formatMeetingShort(s)})` : "изтрита среща");
        if (s) g.searchTextParts.push(s);
        break;
      }
      case "order_deleted": {
        const d = metaStr(m, "description");
        const a = m.amount as number | null | undefined;
        const parts: string[] = ["изтрита поръчка"];
        if (d) parts.push(d);
        if (a != null) parts.push(`${a} €`);
        g.deletionLabels.push(parts.join(" · "));
        if (d) g.searchTextParts.push(d);
        if (a != null) g.searchTextParts.push(String(a));
        break;
      }
      case "client_deleted": {
        const cn = metaStr(m, "client_name");
        g.deletionLabels.push(`изтрит клиент (${cn ?? "—"})`);
        if (cn) g.searchTextParts.push(cn);
        break;
      }
      default:
        break;
    }
  }

  const out: StatisticAggregatedRow[] = [];
  for (const g of groups.values()) {
    const cid = g.clientId;
    const clientExists = cid > 0 && clientMap.has(cid);

    const meetings = [...g.meetingIdSet]
      .map((mid) => {
        const md = meetingDetailMap.get(mid);
        const sched = md?.scheduled_at;
        if (!sched) return null;
        const t = new Date(sched).getTime();
        return { id: mid, scheduledAt: sched, isUpcoming: t > now };
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

    const live = clientMap.get(cid);
    const clientName = live?.name ?? g.clientName;
    const company = live?.company ?? g.company;

    const searchText = [...g.searchTextParts, clientName, company ?? ""].filter(Boolean).join(" ").trim();

    const actorEntries = [...g.actorKeySet]
      .map((k) => {
        const { label, initials } = labelInitialsForActorKey(k);
        return { key: k, label, initials };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "bg"));
    const actorLabels = actorEntries.map((e) => e.label);
    const actorInitials = actorEntries.map((e) => e.initials);

    out.push({
      dayKey: g.dayKey,
      clientId: cid,
      clientName,
      company,
      clientExists,
      clientCreated: g.clientCreated,
      hasContact: g.hasContact,
      conversationCount: g.conversationCount,
      meetings,
      orders: g.orderSnapshots,
      deletionLabels: [...new Set(g.deletionLabels)],
      lastOccurredAt: g.lastOccurredAt,
      searchText,
      actorLabels,
      actorInitials,
    });
  }
  return { rows: out, daySummaries };
}

export async function fetchStatisticsDaySummaries(
  actorFilter?: StatisticsActorFilter
): Promise<StatisticsDaySummariesResult> {
  const sb = getSupabase();
  const orgLower = statsOrgCodeLower();
  const rxgClientCreatedCutoffMs = orgLower === "rxg" ? startOfCurrentLocalHourMs() : null;
  const eventsRaw = await fetchAllActivityEventsForStats(sb, actorFilter, { rxgClientCreatedCutoffMs });
  type Ev = {
    occurred_at: string;
    event_type: string;
    metadata: Record<string, unknown> | null;
    actor_user_id: number | null;
  };
  const list = (eventsRaw as Ev[]).filter((e) => {
    if (e.event_type !== "client_created") return true;
    if (rxgClientCreatedCutoffMs == null) return true;
    return new Date(e.occurred_at).getTime() >= rxgClientCreatedCutoffMs;
  });
  if (!list.length) return { daySummaries: [], dayKeys: [] };

  const compC = requireCompanyId();
  const actorIdsForLabels = [...new Set(list.map((e) => e.actor_user_id).filter((x): x is number => x != null))];
  const staffById = new Map<number, { username: string; display_name: string | null }>();
  if (actorIdsForLabels.length > 0) {
    for (let i = 0; i < actorIdsForLabels.length; i += STATS_IN_QUERY_CHUNK) {
      const slice = actorIdsForLabels.slice(i, i + STATS_IN_QUERY_CHUNK);
      const { data: staffRows, error: sErr } = await sb
        .from("staff_users")
        .select("id, username, display_name")
        .eq("company_id", compC)
        .in("id", slice);
      if (sErr) throw new Error(sErr.message);
      for (const s of staffRows ?? []) {
        const row = s as { id: number; username: string; display_name: string | null };
        staffById.set(row.id, { username: row.username, display_name: row.display_name });
      }
    }
  }

  const eventActorKeyFromEv = (e: Ev): string => {
    if (e.actor_user_id != null) return `s\t${e.actor_user_id}`;
    const lab = metaStr(e.metadata, "admin_actor_label");
    const ini = metaStr(e.metadata, "admin_actor_initials");
    if (lab) return `a\tnamed\t${lab}\t${ini ?? ""}`;
    return "a\tdef";
  };
  const labelInitialsForActorKey = (key: string): { label: string; initials: string } => {
    const parts = key.split("\t");
    if (parts[0] === "s" && parts[1]) {
      const id = parseInt(parts[1], 10);
      if (Number.isFinite(id)) {
        const s = staffById.get(id);
        if (!s) return { label: `Служител #${id}`, initials: String(id).slice(0, 2).toUpperCase() };
        const label = s.display_name ? `${s.display_name} (${s.username})` : s.username;
        const dn = s.display_name?.trim();
        if (dn) {
          const p = dn.split(/\s+/).filter(Boolean);
          if (p.length >= 2) return { label, initials: `${p[0]![0]}${p[1]![0]}`.toUpperCase() };
          if (p.length === 1) return { label, initials: p[0]!.slice(0, 2).toUpperCase() };
        }
        return { label, initials: s.username.slice(0, 2).toUpperCase() };
      }
    }
    if (parts[0] === "a" && parts[1] === "def") return { label: "Админ / без акаунт", initials: "АД" };
    if (parts[0] === "a" && parts[1] === "named" && parts[2]) {
      const label = parts[2]!;
      const ini = (parts[3] ?? "").trim();
      return { label, initials: ini || initialsFromFullName(label) };
    }
    return { label: "?", initials: "?" };
  };

  type DayAcc = {
    dayKey: string;
    actorKey: string;
    newClients: number;
    contacts: number;
    conversations: number;
    meetings: number;
    orders: number;
    deletions: number;
  };
  const dayAcc = new Map<string, DayAcc>();
  for (const e of list) {
    const dk = localDayKeyFromIso(e.occurred_at);
    const ak = eventActorKeyFromEv(e);
    const key = `${dk}\t${ak}`;
    let a = dayAcc.get(key);
    if (!a) {
      a = { dayKey: dk, actorKey: ak, newClients: 0, contacts: 0, conversations: 0, meetings: 0, orders: 0, deletions: 0 };
      dayAcc.set(key, a);
    }
    switch (e.event_type) {
      case "client_created": a.newClients++; break;
      case "contact": a.contacts++; break;
      case "conversation": a.conversations++; break;
      case "meeting": a.meetings++; break;
      case "order": a.orders++; break;
      case "conversation_deleted":
      case "meeting_deleted":
      case "order_deleted":
      case "client_deleted":
        a.deletions++;
        break;
      default:
        break;
    }
  }
  const daySummaries: StatisticsDayActorSummary[] = [...dayAcc.values()]
    .map((a) => {
      const li = labelInitialsForActorKey(a.actorKey);
      return { dayKey: a.dayKey, actorKey: a.actorKey, actorLabel: li.label, actorInitials: li.initials, newClients: a.newClients, contacts: a.contacts, conversations: a.conversations, meetings: a.meetings, orders: a.orders, deletions: a.deletions };
    })
    .filter((s) => s.newClients + s.contacts + s.conversations + s.meetings + s.orders + s.deletions > 0)
    .sort((x, y) => (x.dayKey !== y.dayKey ? y.dayKey.localeCompare(x.dayKey) : x.actorLabel.localeCompare(y.actorLabel, "bg")));
  const dayKeys = [...new Set(daySummaries.map((s) => s.dayKey))];
  return { daySummaries, dayKeys };
}

export async function fetchDayConversations(
  dayKey: string,
  actorFilter?: StatisticsActorFilter
): Promise<DayConversationRow[]> {
  const sb = getSupabase();
  const comp = requireCompanyId();
  const events = await fetchActivityEventsForStatsDay(sb, dayKey, actorFilter);
  const conversationEvents = events.filter(
    (e) => e.event_type === "conversation" && e.ref_id != null
  );
  if (!conversationEvents.length) return [];

  const actorIds = [
    ...new Set(
      conversationEvents
        .map((e) => e.actor_user_id)
        .filter((x): x is number => x != null)
    ),
  ];
  const staffById = new Map<number, { username: string; display_name: string | null }>();
  if (actorIds.length > 0) {
    for (let i = 0; i < actorIds.length; i += STATS_IN_QUERY_CHUNK) {
      const slice = actorIds.slice(i, i + STATS_IN_QUERY_CHUNK);
      const { data: staffRows, error: sErr } = await sb
        .from("staff_users")
        .select("id, username, display_name")
        .eq("company_id", comp)
        .in("id", slice);
      if (sErr) throw new Error(sErr.message);
      for (const s of staffRows ?? []) {
        const row = s as { id: number; username: string; display_name: string | null };
        staffById.set(row.id, { username: row.username, display_name: row.display_name });
      }
    }
  }

  const actorLabel = (actorId: number | null, metadata: Record<string, unknown> | null): string => {
    if (actorId == null) {
      const named = metaStr(metadata, "admin_actor_label");
      return named ?? "Админ / без акаунт";
    }
    const s = staffById.get(actorId);
    if (!s) return `Служител #${actorId}`;
    return s.display_name ? `${s.display_name} (${s.username})` : s.username;
  };
  const actorInitials = (actorId: number | null, metadata: Record<string, unknown> | null): string => {
    if (actorId == null) {
      const ini = metaStr(metadata, "admin_actor_initials");
      return ini?.trim() || "АД";
    }
    const s = staffById.get(actorId);
    if (!s) {
      const idStr = String(actorId);
      return idStr.length >= 2 ? idStr.slice(0, 2).toUpperCase() : `${idStr}?`.toUpperCase();
    }
    const dn = s.display_name?.trim();
    if (dn) {
      const parts = dn.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
      if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    }
    return s.username.slice(0, 2).toUpperCase();
  };

  const convIds = [...new Set(conversationEvents.map((e) => e.ref_id as number))];
  const convMap = new Map<number, { id: number; client_id: number; type: string; notes: string | null }>();
  for (let i = 0; i < convIds.length; i += STATS_IN_QUERY_CHUNK) {
    const slice = convIds.slice(i, i + STATS_IN_QUERY_CHUNK);
    const { data: convRows, error: cErr } = await sb
      .from("client_conversations")
      .select("id, client_id, type, notes")
      .eq("company_id", comp)
      .in("id", slice);
    if (cErr) throw new Error(cErr.message);
    for (const c of convRows ?? []) {
      const row = c as { id: number; client_id: number; type: string; notes: string | null };
      convMap.set(row.id, row);
    }
  }

  const clientIds = [
    ...new Set(
      conversationEvents
        .map((e) => e.client_id)
        .filter((x): x is number => x != null)
    ),
  ];
  const clientMap = new Map<number, { name: string; company: string | null }>();
  if (clientIds.length > 0) {
    for (let i = 0; i < clientIds.length; i += STATS_IN_QUERY_CHUNK) {
      const slice = clientIds.slice(i, i + STATS_IN_QUERY_CHUNK);
      const { data: cRows, error: clErr } = await sb
        .from("clients")
        .select("id, name, company")
        .eq("company_id", comp)
        .in("id", slice);
      if (clErr) throw new Error(clErr.message);
      for (const c of cRows ?? []) {
        const row = c as { id: number; name: string; company: string | null };
        clientMap.set(row.id, { name: row.name, company: row.company });
      }
    }
  }

  const out: DayConversationRow[] = [];
  for (const ev of conversationEvents) {
    const conv = convMap.get(ev.ref_id as number);
    if (!conv) continue;
    const cl =
      clientMap.get(conv.client_id) ??
      clientMap.get(ev.client_id ?? -1) ?? { name: metaStr(ev.metadata, "client_name") ?? `#${conv.client_id}`, company: null };
    out.push({
      id: conv.id,
      dayKey,
      occurredAt: ev.occurred_at,
      clientId: conv.client_id,
      clientName: cl.name,
      clientCompany: cl.company,
      actorLabel: actorLabel(ev.actor_user_id, ev.metadata),
      actorInitials: actorInitials(ev.actor_user_id, ev.metadata),
      type: conv.type,
      notes: conv.notes ?? null,
    });
  }
  out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return out;
}

export async function fetchStatisticsRowsForDay(
  dayKey: string,
  actorFilter?: StatisticsActorFilter
): Promise<StatisticAggregatedRow[]> {
  const sb = getSupabase();
  const compC = requireCompanyId();
  const eventsRaw = await fetchActivityEventsForStatsDay(sb, dayKey, actorFilter);
  type Ev = {
    id: number;
    client_id: number | null;
    occurred_at: string;
    event_type: string;
    ref_id: number | null;
    metadata: Record<string, unknown> | null;
    actor_user_id: number | null;
  };
  const list = eventsRaw as Ev[];
  if (!list.length) return [];

  const actorIdsForLabels = [...new Set(list.map((e) => e.actor_user_id).filter((x): x is number => x != null))];
  const staffById = new Map<number, { username: string; display_name: string | null }>();
  if (actorIdsForLabels.length > 0) {
    for (let i = 0; i < actorIdsForLabels.length; i += STATS_IN_QUERY_CHUNK) {
      const slice = actorIdsForLabels.slice(i, i + STATS_IN_QUERY_CHUNK);
      const { data: staffRows, error: sErr } = await sb
        .from("staff_users")
        .select("id, username, display_name")
        .eq("company_id", compC)
        .in("id", slice);
      if (sErr) throw new Error(sErr.message);
      for (const s of staffRows ?? []) {
        const row = s as { id: number; username: string; display_name: string | null };
        staffById.set(row.id, { username: row.username, display_name: row.display_name });
      }
    }
  }

  const eventActorKeyFromEv = (e: Ev): string => {
    if (e.actor_user_id != null) return `s\t${e.actor_user_id}`;
    const lab = metaStr(e.metadata, "admin_actor_label");
    const ini = metaStr(e.metadata, "admin_actor_initials");
    if (lab) return `a\tnamed\t${lab}\t${ini ?? ""}`;
    return "a\tdef";
  };
  const labelInitialsForActorKey = (key: string): { label: string; initials: string } => {
    const parts = key.split("\t");
    if (parts[0] === "s" && parts[1]) {
      const id = parseInt(parts[1], 10);
      if (Number.isFinite(id)) {
        const s = staffById.get(id);
        const label = s ? (s.display_name ? `${s.display_name} (${s.username})` : s.username) : `Служител #${id}`;
        if (!s) return { label, initials: String(id).slice(0, 2).toUpperCase() };
        const dn = s.display_name?.trim();
        if (dn) {
          const p = dn.split(/\s+/).filter(Boolean);
          if (p.length >= 2) return { label, initials: `${p[0]![0]}${p[1]![0]}`.toUpperCase() };
          if (p.length === 1) return { label, initials: p[0]!.slice(0, 2).toUpperCase() };
        }
        return { label, initials: s.username.slice(0, 2).toUpperCase() };
      }
    }
    if (parts[0] === "a" && parts[1] === "def") return { label: "Админ / без акаунт", initials: "АД" };
    if (parts[0] === "a" && parts[1] === "named" && parts[2]) {
      const label = parts[2]!;
      const ini = (parts[3] ?? "").trim();
      return { label, initials: ini || initialsFromFullName(label) };
    }
    return { label: "?", initials: "?" };
  };

  const clientIds = [...new Set(list.map((e) => e.client_id).filter((x): x is number => x != null))];
  const clientMap = new Map<number, { name: string; company: string | null }>();
  if (clientIds.length > 0) {
    for (let i = 0; i < clientIds.length; i += STATS_IN_QUERY_CHUNK) {
      const slice = clientIds.slice(i, i + STATS_IN_QUERY_CHUNK);
      const { data: clientRows, error: cErr } = await sb
        .from("clients")
        .select("id, name, company")
        .eq("company_id", compC)
        .in("id", slice);
      if (cErr) throw new Error(cErr.message);
      for (const c of clientRows ?? []) {
        const row = c as { id: number; name: string; company: string | null };
        clientMap.set(row.id, { name: row.name, company: row.company });
      }
    }
  }

  const meetingIds = new Set<number>();
  const orderIds = new Set<number>();
  const conversationIds = new Set<number>();
  for (const e of list) {
    if (e.event_type === "meeting" && e.ref_id != null) meetingIds.add(e.ref_id);
    if (e.event_type === "order" && e.ref_id != null) orderIds.add(e.ref_id);
    if (e.event_type === "conversation" && e.ref_id != null) conversationIds.add(e.ref_id);
  }

  const meetingDetailMap = new Map<number, { id: number; scheduled_at: string; outcome_notes: string | null; meeting_address: string | null; contact_person: string | null; phone: string | null }>();
  if (meetingIds.size > 0) {
    const mids = [...meetingIds];
    for (let i = 0; i < mids.length; i += STATS_IN_QUERY_CHUNK) {
      const slice = mids.slice(i, i + STATS_IN_QUERY_CHUNK);
      const { data: mrows, error: mErr } = await sb
        .from("client_meetings")
        .select("id, scheduled_at, outcome_notes, meeting_address, contact_person, phone")
        .eq("company_id", compC)
        .in("id", slice);
      if (mErr) throw new Error(mErr.message);
      for (const m of mrows ?? []) {
        const row = m as { id: number; scheduled_at: string; outcome_notes: string | null; meeting_address: string | null; contact_person: string | null; phone: string | null };
        meetingDetailMap.set(row.id, row);
      }
    }
  }

  const conversationNotesMap = new Map<number, string>();
  if (conversationIds.size > 0) {
    const cids = [...conversationIds];
    for (let i = 0; i < cids.length; i += STATS_IN_QUERY_CHUNK) {
      const slice = cids.slice(i, i + STATS_IN_QUERY_CHUNK);
      const { data: crows, error: convErr } = await sb
        .from("client_conversations")
        .select("id, notes")
        .eq("company_id", compC)
        .in("id", slice);
      if (convErr) throw new Error(convErr.message);
      for (const c of crows ?? []) {
        const row = c as { id: number; notes: string | null };
        conversationNotesMap.set(row.id, row.notes ?? "");
      }
    }
  }

  const orderMap = new Map<number, { description: string | null; amount: number | null; documents: string | null }>();
  if (orderIds.size > 0) {
    const oids = [...orderIds];
    for (let i = 0; i < oids.length; i += STATS_IN_QUERY_CHUNK) {
      const slice = oids.slice(i, i + STATS_IN_QUERY_CHUNK);
      const { data: orows, error: oErr } = await sb
        .from("client_orders")
        .select("id, description, amount, documents")
        .eq("company_id", compC)
        .in("id", slice);
      if (oErr) throw new Error(oErr.message);
      for (const o of orows ?? []) {
        const row = o as { id: number; description: string | null; amount: number | null; documents: string | null };
        orderMap.set(row.id, { description: row.description, amount: row.amount, documents: row.documents });
      }
    }
  }

  const now = Date.now();
  type G = {
    dayKey: string;
    clientId: number;
    clientName: string;
    company: string | null;
    clientCreated: boolean;
    hasContact: boolean;
    conversationCount: number;
    meetingIdSet: Set<number>;
    orderSnapshots: { description: string | null; amount: number | null }[];
    deletionLabels: string[];
    lastOccurredAt: string;
    searchTextParts: string[];
    actorKeySet: Set<string>;
  };
  const groups = new Map<string, G>();

  const resolveClientLabel = (e: Ev): { name: string; company: string | null } => {
    const cid = e.client_id;
    const m = e.metadata ?? {};
    if (cid != null && clientMap.has(cid)) return clientMap.get(cid)!;
    if (cid != null) return { name: metaStr(m, "client_name") ?? `#${cid}`, company: (m.company as string) ?? null };
    return { name: metaStr(m, "client_name") ?? "?", company: (m.company as string) ?? null };
  };

  for (const e of list) {
    const dk = localDayKeyFromIso(e.occurred_at);
    const { name: rName, company: rCompany } = resolveClientLabel(e);
    const key = `${dk}|${e.client_id ?? `orphan-${e.id}`}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        dayKey: dk,
        clientId: e.client_id ?? -1,
        clientName: rName,
        company: rCompany,
        clientCreated: false,
        hasContact: false,
        conversationCount: 0,
        meetingIdSet: new Set(),
        orderSnapshots: [],
        deletionLabels: [],
        lastOccurredAt: e.occurred_at,
        searchTextParts: [],
        actorKeySet: new Set(),
      };
      groups.set(key, g);
    }
    if (e.occurred_at > g.lastOccurredAt) g.lastOccurredAt = e.occurred_at;
    g.actorKeySet.add(eventActorKeyFromEv(e));
    switch (e.event_type) {
      case "client_created":
        g.clientCreated = true;
        break;
      case "contact":
        g.hasContact = true;
        break;
      case "conversation":
        g.conversationCount++;
        if (e.ref_id != null) {
          const note = conversationNotesMap.get(e.ref_id);
          if (note) g.searchTextParts.push(note);
        }
        break;
      case "meeting":
        if (e.ref_id != null) g.meetingIdSet.add(e.ref_id);
        break;
      case "order":
        if (e.ref_id != null && orderMap.has(e.ref_id)) {
          const o = orderMap.get(e.ref_id)!;
          g.orderSnapshots.push({ description: o.description, amount: o.amount });
          g.searchTextParts.push(`${o.description ?? ""} ${o.documents ?? ""}`.trim());
        }
        break;
      case "conversation_deleted":
      case "meeting_deleted":
      case "order_deleted":
      case "client_deleted":
        g.deletionLabels.push(e.event_type.replace("_", " "));
        break;
      default:
        break;
    }
  }

  const rows: StatisticAggregatedRow[] = [...groups.values()].map((g) => {
    const meetings = [...g.meetingIdSet]
      .map((id) => {
        const m = meetingDetailMap.get(id);
        if (!m) return null;
        const ts = new Date(m.scheduled_at).getTime();
        return { id: m.id, scheduledAt: m.scheduled_at, isUpcoming: Number.isFinite(ts) ? ts > now : false };
      })
      .filter((x): x is { id: number; scheduledAt: string; isUpcoming: boolean } => x != null)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    const actorPairs = [...g.actorKeySet].map(labelInitialsForActorKey);
    return {
      dayKey: g.dayKey,
      clientId: g.clientId,
      clientName: g.clientName,
      company: g.company,
      clientExists: g.clientId > 0 && clientMap.has(g.clientId),
      clientCreated: g.clientCreated,
      hasContact: g.hasContact,
      conversationCount: g.conversationCount,
      meetings,
      orders: g.orderSnapshots,
      deletionLabels: g.deletionLabels,
      lastOccurredAt: g.lastOccurredAt,
      searchText: g.searchTextParts.join(" "),
      actorLabels: actorPairs.map((x) => x.label),
      actorInitials: actorPairs.map((x) => x.initials),
    };
  });

  rows.sort((a, b) => {
    const ta = new Date(a.lastOccurredAt).getTime();
    const tb = new Date(b.lastOccurredAt).getTime();
    if (tb !== ta) return tb - ta;
    return a.clientName.localeCompare(b.clientName, "bg");
  });
  return rows;
}

function formatMeetingShort(iso: string): string {
  try {
    return new Date(iso).toLocaleString("bg-BG", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

// Client orders
export interface ClientOrder {
  id: number;
  client_id: number;
  status: "pending" | "confirmed" | "shipped" | "delivered";
  amount: number | null;
  payment_date: string | null;
  description: string | null;
  documents: string | null;
  created_at: string;
  updated_at: string;
}

export async function getClientOrders(clientId: number): Promise<ClientOrder[]> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb
    .from("client_orders")
    .select("*")
    .eq("client_id", clientId)
    .eq("company_id", c)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ClientOrder[];
}

export async function addClientOrder(
  clientId: number,
  data: { status?: string; amount?: number; payment_date?: string; description?: string; documents?: string }
): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data: row, error } = await sb
    .from("client_orders")
    .insert({
      client_id: clientId,
      status: data.status ?? "pending",
      amount: data.amount ?? null,
      payment_date: data.payment_date ?? null,
      description: data.description ?? null,
      documents: data.documents ?? null,
      company_id: c,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await updateClientActivity(clientId);
  if (row?.id != null) {
    await logActivityEvent(clientId, "order", row.id as number, {
      description: data.description ?? null,
      amount: data.amount ?? null,
    });
  }
}

export async function updateClientOrder(id: number, data: Partial<ClientOrder>): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data: rows, error: fErr } = await sb
    .from("client_orders")
    .select("*")
    .eq("id", id)
    .eq("company_id", c)
    .maybeSingle();
  if (fErr) throw new Error(fErr.message);
  if (!rows) return;
  const o = rows as ClientOrder;
  const { error } = await sb
    .from("client_orders")
    .update({
      status: data.status ?? o.status,
      amount: data.amount ?? o.amount,
      payment_date: data.payment_date ?? o.payment_date,
      description: data.description ?? o.description,
      documents: data.documents ?? o.documents,
      updated_at: nowIso(),
    })
    .eq("id", id)
    .eq("company_id", c);
  if (error) throw new Error(error.message);
  await updateClientActivity(o.client_id);
}

export async function deleteClientOrder(id: number): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data: row, error: fErr } = await sb
    .from("client_orders")
    .select("*")
    .eq("id", id)
    .eq("company_id", c)
    .maybeSingle();
  if (fErr) throw new Error(fErr.message);
  if (!row) return;
  const o = row as ClientOrder;
  await logActivityEvent(o.client_id, "order_deleted", id, {
    description: o.description,
    amount: o.amount,
  });
  const { error } = await sb.from("client_orders").delete().eq("id", id).eq("company_id", c);
  if (error) throw new Error(error.message);
}

// Client purchases
export interface ClientPurchase {
  id: number;
  client_id: number;
  purchase_date: string;
  brand: string | null;
  model: string | null;
  value: number | null;
  note: string | null;
  created_at: string;
}

export async function getClientPurchases(clientId: number): Promise<ClientPurchase[]> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb
    .from("client_purchases")
    .select("*")
    .eq("client_id", clientId)
    .eq("company_id", c)
    .order("purchase_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ClientPurchase[];
}

export async function addClientPurchase(
  clientId: number,
  data: { purchase_date: string; brand?: string; model?: string; value?: number; note?: string }
): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb.from("client_purchases").insert({
    client_id: clientId,
    purchase_date: data.purchase_date,
    brand: data.brand ?? null,
    model: data.model ?? null,
    value: data.value ?? null,
    note: data.note ?? null,
    company_id: c,
  });
  if (error) throw new Error(error.message);
  await updateClientActivity(clientId);
}

export async function updateClientPurchase(id: number, data: Partial<ClientPurchase>): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb
    .from("client_purchases")
    .update({
      purchase_date: data.purchase_date ?? "",
      brand: data.brand ?? null,
      model: data.model ?? null,
      value: data.value ?? null,
      note: data.note ?? null,
    })
    .eq("id", id)
    .eq("company_id", c);
  if (error) throw new Error(error.message);
  const { data: rows } = await sb
    .from("client_purchases")
    .select("client_id")
    .eq("id", id)
    .eq("company_id", c)
    .maybeSingle();
  if (rows) await updateClientActivity((rows as { client_id: number }).client_id);
}

export async function deleteClientPurchase(id: number): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb.from("client_purchases").delete().eq("id", id).eq("company_id", c);
  if (error) throw new Error(error.message);
}

// Suppliers
export interface Supplier {
  id: number;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  eik: string | null;
  vat_number: string | null;
  contact_person: string | null;
  bank_account: string | null;
  website: string | null;
  offers: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function supplierSearchTextFromRow(r: {
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  offers: string | null;
  notes: string | null;
  supplier_orders?: { description: string | null; notes: string | null }[] | null;
  supplier_products?: {
    name: string;
    brand: string | null;
    model: string | null;
    parameters: string | null;
    price: string | null;
    technical_info: string | null;
  }[] | null;
}): string {
  const parts: string[] = [
    r.name,
    r.company ?? "",
    r.phone ?? "",
    r.email ?? "",
    r.website ?? "",
    r.offers ?? "",
    r.notes ?? "",
  ];
  for (const o of r.supplier_orders ?? []) parts.push(`${o.description ?? ""} ${o.notes ?? ""}`);
  for (const p of r.supplier_products ?? []) {
    parts.push(
      `${p.name} ${p.brand ?? ""} ${p.model ?? ""} ${p.parameters ?? ""} ${p.price ?? ""} ${p.technical_info ?? ""}`
    );
  }
  return parts.join(" ");
}

export async function getSuppliers(): Promise<Supplier[]> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb.from("suppliers").select("*").eq("company_id", c).order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Supplier[];
}

export async function searchSuppliers(query: string): Promise<Supplier[]> {
  if (!query.trim()) return getSuppliers();
  const term = query.trim();
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb.from("suppliers").select(`
      *,
      supplier_orders (description, notes),
      supplier_products (name, brand, model, parameters, price, technical_info)
    `).eq("company_id", c);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as (Supplier & {
    supplier_orders?: { description: string | null; notes: string | null }[] | null;
    supplier_products?: {
      name: string;
      brand: string | null;
      model: string | null;
      parameters: string | null;
      price: string | null;
      technical_info: string | null;
    }[] | null;
  })[];
  const filtered = rows.filter((r) => containsIgnoreCase(supplierSearchTextFromRow(r), term));
  return filtered.map((r) => {
    const { supplier_orders: _a, supplier_products: _b, ...s } = r;
    return s as Supplier;
  });
}

export async function getSupplier(id: number): Promise<Supplier | null> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb.from("suppliers").select("*").eq("id", id).eq("company_id", c).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Supplier | null) ?? null;
}

export async function createSupplier(data: Omit<Supplier, "id" | "created_at" | "updated_at">): Promise<number> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data: row, error } = await sb
    .from("suppliers")
    .insert({
      name: data.name,
      company: data.company ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      eik: data.eik ?? null,
      vat_number: data.vat_number ?? null,
      contact_person: data.contact_person ?? null,
      bank_account: data.bank_account ?? null,
      website: data.website ?? null,
      offers: data.offers ?? null,
      notes: data.notes ?? null,
      company_id: c,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return row!.id as number;
}

export async function createSuppliersBulk(items: Omit<Supplier, "id" | "created_at" | "updated_at">[]): Promise<number> {
  let count = 0;
  for (const data of items) {
    await createSupplier(data);
    count++;
  }
  return count;
}

export async function updateSupplier(id: number, data: Partial<Supplier>): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb
    .from("suppliers")
    .update({
      name: data.name ?? "",
      company: data.company ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      eik: data.eik ?? null,
      vat_number: data.vat_number ?? null,
      contact_person: data.contact_person ?? null,
      bank_account: data.bank_account ?? null,
      website: data.website ?? null,
      offers: data.offers ?? null,
      notes: data.notes ?? null,
      updated_at: nowIso(),
    })
    .eq("id", id)
    .eq("company_id", c);
  if (error) throw new Error(error.message);
}

export async function deleteSupplier(id: number): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb.from("suppliers").delete().eq("id", id).eq("company_id", c);
  if (error) throw new Error(error.message);
}

// Supplier orders
export interface SupplierOrder {
  id: number;
  supplier_id: number;
  date: string;
  description: string | null;
  notes: string | null;
  created_at: string;
}

export async function getSupplierOrders(supplierId: number): Promise<SupplierOrder[]> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb
    .from("supplier_orders")
    .select("*")
    .eq("supplier_id", supplierId)
    .eq("company_id", c)
    .order("date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierOrder[];
}

export async function addSupplierOrder(supplierId: number, date: string, description: string, notes: string): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb
    .from("supplier_orders")
    .insert({ supplier_id: supplierId, date, description, notes, company_id: c });
  if (error) throw new Error(error.message);
}

// Supplier products
export interface SupplierProduct {
  id: number;
  supplier_id: number;
  name: string;
  brand: string | null;
  model: string | null;
  parameters: string | null;
  price: string | null;
  link: string | null;
  photo_path: string | null;
  technical_info: string | null;
  created_at: string;
}

export async function getSupplierProducts(supplierId: number): Promise<SupplierProduct[]> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb
    .from("supplier_products")
    .select("*")
    .eq("supplier_id", supplierId)
    .eq("company_id", c)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierProduct[];
}

export async function addSupplierProduct(
  supplierId: number,
  data: Omit<SupplierProduct, "id" | "supplier_id" | "created_at">
): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb.from("supplier_products").insert({
    supplier_id: supplierId,
    name: data.name,
    brand: data.brand ?? null,
    model: data.model ?? null,
    parameters: data.parameters ?? null,
    price: data.price ?? null,
    link: data.link ?? null,
    photo_path: data.photo_path ?? null,
    technical_info: data.technical_info ?? null,
    company_id: c,
  });
  if (error) throw new Error(error.message);
}

export async function addSupplierProductsBulk(
  supplierId: number,
  items: Omit<SupplierProduct, "id" | "supplier_id" | "created_at">[]
): Promise<number> {
  let count = 0;
  for (const data of items) {
    await addSupplierProduct(supplierId, data);
    count++;
  }
  return count;
}

export async function updateSupplierProduct(id: number, data: Partial<SupplierProduct>): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb
    .from("supplier_products")
    .update({
      name: data.name ?? "",
      brand: data.brand ?? null,
      model: data.model ?? null,
      parameters: data.parameters ?? null,
      price: data.price ?? null,
      link: data.link ?? null,
      photo_path: data.photo_path ?? null,
      technical_info: data.technical_info ?? null,
    })
    .eq("id", id)
    .eq("company_id", c);
  if (error) throw new Error(error.message);
}

export async function deleteSupplierProduct(id: number): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb.from("supplier_products").delete().eq("id", id).eq("company_id", c);
  if (error) throw new Error(error.message);
}

// Competitors
export interface Competitor {
  id: number;
  name: string;
  website: string | null;
  contacts: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompetitorProduct {
  id: number;
  competitor_id: number;
  name: string;
  brand: string | null;
  model: string | null;
  parameters: string | null;
  price: string | null;
  link: string | null;
  photo_path: string | null;
  created_at: string;
}

function competitorSearchTextFromRow(r: {
  name: string;
  website: string | null;
  contacts: string | null;
  address: string | null;
  notes: string | null;
  competitor_products?: {
    name: string;
    brand: string | null;
    model: string | null;
    parameters: string | null;
    price: string | null;
  }[] | null;
}): string {
  const parts: string[] = [r.name, r.website ?? "", r.contacts ?? "", r.address ?? "", r.notes ?? ""];
  for (const p of r.competitor_products ?? []) {
    parts.push(`${p.name} ${p.brand ?? ""} ${p.model ?? ""} ${p.parameters ?? ""} ${p.price ?? ""}`);
  }
  return parts.join(" ");
}

export async function getCompetitors(): Promise<Competitor[]> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb.from("competitors").select("*").eq("company_id", c).order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Competitor[];
}

export async function searchCompetitors(query: string): Promise<Competitor[]> {
  if (!query.trim()) return getCompetitors();
  const term = query.trim();
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb.from("competitors").select(`
      *,
      competitor_products (name, brand, model, parameters, price)
    `).eq("company_id", c);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as (Competitor & {
    competitor_products?: {
      name: string;
      brand: string | null;
      model: string | null;
      parameters: string | null;
      price: string | null;
    }[] | null;
  })[];
  const filtered = rows.filter((r) => containsIgnoreCase(competitorSearchTextFromRow(r), term));
  return filtered.map((r) => {
    const { competitor_products: _p, ...c } = r;
    return c as Competitor;
  });
}

export async function getCompetitor(id: number): Promise<Competitor | null> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb.from("competitors").select("*").eq("id", id).eq("company_id", c).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Competitor | null) ?? null;
}

export async function createCompetitor(data: Omit<Competitor, "id" | "created_at" | "updated_at">): Promise<number> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data: row, error } = await sb
    .from("competitors")
    .insert({
      name: data.name,
      website: data.website ?? null,
      contacts: data.contacts ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
      company_id: c,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return row!.id as number;
}

export async function createCompetitorsBulk(items: Omit<Competitor, "id" | "created_at" | "updated_at">[]): Promise<number> {
  let count = 0;
  for (const data of items) {
    await createCompetitor(data);
    count++;
  }
  return count;
}

export async function updateCompetitor(id: number, data: Partial<Competitor>): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb
    .from("competitors")
    .update({
      name: data.name ?? "",
      website: data.website ?? null,
      contacts: data.contacts ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
      updated_at: nowIso(),
    })
    .eq("id", id)
    .eq("company_id", c);
  if (error) throw new Error(error.message);
}

export async function deleteCompetitor(id: number): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb.from("competitors").delete().eq("id", id).eq("company_id", c);
  if (error) throw new Error(error.message);
}

export async function getCompetitorProducts(competitorId: number): Promise<CompetitorProduct[]> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb
    .from("competitor_products")
    .select("*")
    .eq("competitor_id", competitorId)
    .eq("company_id", c)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as CompetitorProduct[];
}

export async function addCompetitorProduct(
  competitorId: number,
  data: Omit<CompetitorProduct, "id" | "competitor_id" | "created_at">
): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb.from("competitor_products").insert({
    competitor_id: competitorId,
    name: data.name,
    brand: data.brand ?? null,
    model: data.model ?? null,
    parameters: data.parameters ?? null,
    price: data.price ?? null,
    link: data.link ?? null,
    photo_path: data.photo_path ?? null,
    company_id: c,
  });
  if (error) throw new Error(error.message);
}

export async function addCompetitorProductsBulk(
  competitorId: number,
  items: Omit<CompetitorProduct, "id" | "competitor_id" | "created_at">[]
): Promise<number> {
  let count = 0;
  for (const data of items) {
    await addCompetitorProduct(competitorId, data);
    count++;
  }
  return count;
}

export async function updateCompetitorProduct(id: number, data: Partial<CompetitorProduct>): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb
    .from("competitor_products")
    .update({
      name: data.name ?? "",
      brand: data.brand ?? null,
      model: data.model ?? null,
      parameters: data.parameters ?? null,
      price: data.price ?? null,
      link: data.link ?? null,
      photo_path: data.photo_path ?? null,
    })
    .eq("id", id)
    .eq("company_id", c);
  if (error) throw new Error(error.message);
}

export async function deleteCompetitorProduct(id: number): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb.from("competitor_products").delete().eq("id", id).eq("company_id", c);
  if (error) throw new Error(error.message);
}

// Global search
export interface SearchResult {
  type: "client" | "supplier" | "transport_supplier" | "competitor" | "supplier_product";
  id: number;
  label: string;
  sublabel?: string;
  productId?: number;
  brand?: string | null;
  model?: string | null;
  price?: string | null;
  parameters?: string | null;
}

export interface GlobalSearchResults {
  main: SearchResult[];
  supplierProducts: SearchResult[];
}

export async function searchSupplierProducts(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const term = query.trim();
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb
    .from("supplier_products")
    .select("id, supplier_id, name, brand, model, parameters, price, technical_info, suppliers(name)")
    .eq("company_id", c);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as {
    id: number;
    supplier_id: number;
    name: string;
    brand: string | null;
    model: string | null;
    parameters: string | null;
    price: string | null;
    technical_info: string | null;
    suppliers: { name: string } | { name: string }[] | null;
  }[];
  const filtered = rows.filter((r) => {
    const supName = Array.isArray(r.suppliers) ? r.suppliers[0]?.name : r.suppliers?.name;
    const searchText = `${r.name} ${r.brand ?? ""} ${r.model ?? ""} ${r.parameters ?? ""} ${r.price ?? ""} ${r.technical_info ?? ""} ${supName ?? ""}`;
    return containsIgnoreCase(searchText, term);
  });
  return filtered.map((r) => {
    const supName = Array.isArray(r.suppliers) ? r.suppliers[0]?.name : r.suppliers?.name;
    return {
      type: "supplier_product" as const,
      id: r.supplier_id,
      productId: r.id,
      label: r.name,
      sublabel: supName,
      brand: r.brand,
      model: r.model,
      price: r.price,
      parameters: r.parameters,
    };
  });
}

export async function globalSearch(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const term = query.trim();
  const sb = getSupabase();
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  const addUnique = (type: SearchResult["type"], id: number, label: string, sublabel?: string) => {
    const key = `${type}-${id}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ type, id, label, sublabel });
    }
  };

  const c = requireCompanyId();
  let clientsQuery = sb.from("clients").select(`
      id, name, company,
      client_conversations (notes),
      client_orders (description, documents),
      client_custom_fields (field_name, field_value),
      client_purchases (brand, model, note)
    `).eq("company_id", c).is("deleted_at", null);
  clientsQuery = applyClientVisibilityReadFilter(clientsQuery);
  const { data: clientsData, error: cErr } = await clientsQuery;
  if (cErr) throw new Error(cErr.message);
  for (const c of clientsData ?? []) {
    const row = c as unknown as Parameters<typeof clientSearchTextFromRow>[0] & {
      id: number;
      name: string;
      company: string | null;
    };
    if (containsIgnoreCase(clientSearchTextFromRow(row), term)) {
      addUnique("client", row.id, row.name, row.company ?? undefined);
    }
  }

  const { data: suppliersData, error: sErr } = await sb.from("suppliers").select(`
      id, name, company,
      supplier_orders (description, notes),
      supplier_products (name, brand, model, parameters, price, technical_info)
    `).eq("company_id", c);
  if (sErr) throw new Error(sErr.message);
  for (const s of suppliersData ?? []) {
    const row = s as unknown as Parameters<typeof supplierSearchTextFromRow>[0] & {
      id: number;
      name: string;
      company: string | null;
    };
    if (containsIgnoreCase(supplierSearchTextFromRow(row), term)) {
      addUnique("supplier", row.id, row.name, row.company ?? undefined);
    }
  }

  const { data: transportData, error: tErr } = await sb.from("transport_suppliers").select(`
      *,
      transport_supplier_history (description, notes)
    `).eq("company_id", c);
  if (tErr) throw new Error(tErr.message);
  for (const t of transportData ?? []) {
    const ts = t as {
      id: number;
      company_name: string;
      phone?: string | null;
      email?: string | null;
      contact_person?: string | null;
      notes?: string | null;
      comment?: string | null;
      transport_supplier_history?: { description: string | null; notes: string | null }[] | null;
    };
    const hist = (ts.transport_supplier_history ?? []).map((h) => `${h.description ?? ""} ${h.notes ?? ""}`).join(" ");
    const searchText = `${ts.company_name} ${ts.phone ?? ""} ${ts.email ?? ""} ${ts.contact_person ?? ""} ${ts.notes ?? ""} ${ts.comment ?? ""} ${hist}`;
    if (containsIgnoreCase(searchText, term)) addUnique("transport_supplier", ts.id, ts.company_name);
  }

  const { data: competitorsData, error: coErr } = await sb.from("competitors").select(`
      id, name,
      competitor_products (name, brand, model, parameters, price)
    `).eq("company_id", c);
  if (coErr) throw new Error(coErr.message);
  for (const c of competitorsData ?? []) {
    const row = c as unknown as Parameters<typeof competitorSearchTextFromRow>[0] & { id: number; name: string };
    if (containsIgnoreCase(competitorSearchTextFromRow(row), term)) addUnique("competitor", row.id, row.name);
  }

  return results;
}

export async function globalSearchFull(query: string): Promise<GlobalSearchResults> {
  const [main, supplierProducts] = await Promise.all([globalSearch(query), searchSupplierProducts(query)]);
  return { main, supplierProducts };
}

/** Само клиенти — за ограничен достъп (роля clients). */
export async function globalSearchClientsOnly(query: string): Promise<GlobalSearchResults> {
  if (!query.trim()) return { main: [], supplierProducts: [] };
  const clients = await searchClients(query);
  const main: SearchResult[] = clients.map((c) => ({
    type: "client",
    id: c.id,
    label: c.name,
    sublabel: c.company ?? undefined,
  }));
  return { main, supplierProducts: [] };
}

// Transport suppliers
export interface TransportSupplier {
  id: number;
  company_name: string;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  notes: string | null;
  comment: string | null;
  sea_freight_usd: number | null;
  land_transport_eur: number | null;
  other_eur: number | null;
  created_at: string;
  updated_at: string;
}

export interface TransportSupplierHistory {
  id: number;
  transport_supplier_id: number;
  date: string;
  description: string | null;
  notes: string | null;
  created_at: string;
}

export async function getTransportSuppliers(): Promise<TransportSupplier[]> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb.from("transport_suppliers").select("*").eq("company_id", c).order("company_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as TransportSupplier[];
}

export async function getTransportSupplier(id: number): Promise<TransportSupplier | null> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb.from("transport_suppliers").select("*").eq("id", id).eq("company_id", c).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TransportSupplier | null) ?? null;
}

export async function createTransportSupplier(data: Omit<TransportSupplier, "id" | "created_at" | "updated_at">): Promise<number> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data: row, error } = await sb
    .from("transport_suppliers")
    .insert({
      company_name: data.company_name,
      phone: data.phone ?? null,
      email: data.email ?? null,
      contact_person: data.contact_person ?? null,
      notes: data.notes ?? null,
      comment: data.comment ?? null,
      sea_freight_usd: data.sea_freight_usd ?? null,
      land_transport_eur: data.land_transport_eur ?? null,
      other_eur: data.other_eur ?? null,
      company_id: c,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return row!.id as number;
}

export async function updateTransportSupplier(id: number, data: Partial<TransportSupplier>): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb
    .from("transport_suppliers")
    .update({
      company_name: data.company_name ?? "",
      phone: data.phone ?? null,
      contact_person: data.contact_person ?? null,
      notes: data.notes ?? null,
      comment: data.comment ?? null,
      sea_freight_usd: data.sea_freight_usd ?? null,
      land_transport_eur: data.land_transport_eur ?? null,
      other_eur: data.other_eur ?? null,
      updated_at: nowIso(),
    })
    .eq("id", id)
    .eq("company_id", c);
  if (error) throw new Error(error.message);
}

/** Една заявка към базата — без предварителен SELECT (по-бързо при мрежов достъп). */
export async function updateTransportSupplierPrices(
  id: number,
  prices: { sea_freight_usd: number | null; land_transport_eur: number | null; other_eur: number | null }
): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb
    .from("transport_suppliers")
    .update({
      sea_freight_usd: prices.sea_freight_usd,
      land_transport_eur: prices.land_transport_eur,
      other_eur: prices.other_eur,
      updated_at: nowIso(),
    })
    .eq("id", id)
    .eq("company_id", c);
  if (error) throw new Error(error.message);
}

/** Нулира Sea/Land/Other за всички транспортни доставчици (за ново въвеждане на цени). */
export async function clearAllTransportSupplierPrices(): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data: rows, error: fErr } = await sb.from("transport_suppliers").select("id").eq("company_id", c);
  if (fErr) throw new Error(fErr.message);
  const ids = (rows ?? []).map((r) => (r as { id: number }).id);
  if (ids.length === 0) return;
  const { error } = await sb
    .from("transport_suppliers")
    .update({
      sea_freight_usd: null,
      land_transport_eur: null,
      other_eur: null,
      updated_at: nowIso(),
    })
    .eq("company_id", c)
    .in("id", ids);
  if (error) throw new Error(error.message);
}

export async function deleteTransportSupplier(id: number): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb.from("transport_suppliers").delete().eq("id", id).eq("company_id", c);
  if (error) throw new Error(error.message);
}

export async function getTransportSupplierHistory(transportSupplierId: number): Promise<TransportSupplierHistory[]> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb
    .from("transport_supplier_history")
    .select("*")
    .eq("transport_supplier_id", transportSupplierId)
    .eq("company_id", c)
    .order("date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as TransportSupplierHistory[];
}

export async function addTransportSupplierHistory(
  transportSupplierId: number,
  date: string,
  description: string,
  notes: string
): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb
    .from("transport_supplier_history")
    .insert({ transport_supplier_id: transportSupplierId, date, description, notes, company_id: c });
  if (error) throw new Error(error.message);
}

// --- Служители (clients достъп: потребител + парола) ---

export interface StaffUser {
  id: number;
  username: string;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function listStaffUsers(): Promise<StaffUser[]> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data, error } = await sb
    .from("staff_users")
    .select("id, username, display_name, is_active, created_at, updated_at")
    .eq("company_id", c)
    .order("username", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as StaffUser[];
}

export async function loginStaffUser(username: string, password: string, companyId: number): Promise<StaffUser> {
  const sb = getSupabase();
  const un = username.trim().toLowerCase();
  if (un.length < 1) throw new Error("Въведете потребителско име.");
  const { data, error } = await sb
    .from("staff_users")
    .select("id, username, password_hash, display_name, is_active, created_at, updated_at")
    .eq("company_id", companyId)
    .eq("username", un)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as {
    id: number;
    username: string;
    password_hash: string;
    display_name: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  } | null;
  if (!row?.is_active) throw new Error("Неверен потребител или парола.");
  const { invoke } = await import("@tauri-apps/api/core");
  const ok = await invoke<boolean>("bcrypt_verify_password", { password, hash: row.password_hash });
  if (!ok) throw new Error("Неверен потребител или парола.");
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createStaffUser(username: string, password: string, displayName?: string | null): Promise<number> {
  const un = username.trim().toLowerCase();
  if (un.length < 2) throw new Error("Потребителското име трябва да е поне 2 символа.");
  const { invoke } = await import("@tauri-apps/api/core");
  const hash = await invoke<string>("bcrypt_hash_password", { password });
  const sb = getSupabase();
  const c = requireCompanyId();
  const { data: row, error } = await sb
    .from("staff_users")
    .insert({
      username: un,
      password_hash: hash,
      display_name: displayName?.trim() || null,
      company_id: c,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return row!.id as number;
}

export async function updateStaffUserPassword(id: number, password: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  const hash = await invoke<string>("bcrypt_hash_password", { password });
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb
    .from("staff_users")
    .update({ password_hash: hash, updated_at: nowIso() })
    .eq("id", id)
    .eq("company_id", c);
  if (error) throw new Error(error.message);
}

export async function setStaffUserActive(id: number, isActive: boolean): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb
    .from("staff_users")
    .update({ is_active: isActive, updated_at: nowIso() })
    .eq("id", id)
    .eq("company_id", c);
  if (error) throw new Error(error.message);
}

export async function deleteStaffUser(id: number): Promise<void> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const { error } = await sb.from("staff_users").delete().eq("id", id).eq("company_id", c);
  if (error) throw new Error(error.message);
}

/** JSON snapshot of all tables (for local backup file). */
export async function exportDatabaseSnapshot(): Promise<string> {
  const sb = getSupabase();
  const c = requireCompanyId();
  const [
    clients,
    client_custom_fields,
    client_conversations,
    client_orders,
    client_purchases,
    client_meetings,
    client_activity_events,
    staff_users,
    suppliers,
    supplier_custom_fields,
    supplier_orders,
    supplier_products,
    competitors,
    competitor_products,
    transport_suppliers,
    transport_supplier_history,
    settings,
    conversation_scripts,
    conversation_script_steps,
    machine_catalog_items,
    machine_selling_points,
  ] = await Promise.all([
    sb.from("clients").select("*").eq("company_id", c),
    sb.from("client_custom_fields").select("*").eq("company_id", c),
    sb.from("client_conversations").select("*").eq("company_id", c),
    sb.from("client_orders").select("*").eq("company_id", c),
    sb.from("client_purchases").select("*").eq("company_id", c),
    sb.from("client_meetings").select("*").eq("company_id", c),
    sb.from("client_activity_events").select("*").eq("company_id", c),
    sb.from("staff_users").select("*").eq("company_id", c),
    sb.from("suppliers").select("*").eq("company_id", c),
    sb.from("supplier_custom_fields").select("*").eq("company_id", c),
    sb.from("supplier_orders").select("*").eq("company_id", c),
    sb.from("supplier_products").select("*").eq("company_id", c),
    sb.from("competitors").select("*").eq("company_id", c),
    sb.from("competitor_products").select("*").eq("company_id", c),
    sb.from("transport_suppliers").select("*").eq("company_id", c),
    sb.from("transport_supplier_history").select("*").eq("company_id", c),
    sb.from("settings").select("*").eq("company_id", c),
    sb.from("conversation_scripts").select("*").eq("company_id", c),
    sb.from("conversation_script_steps").select("*").eq("company_id", c),
    sb.from("machine_catalog_items").select("*").eq("company_id", c),
    sb.from("machine_selling_points").select("*").eq("company_id", c),
  ]);
  const errors = [
    clients.error,
    client_custom_fields.error,
    client_conversations.error,
    client_orders.error,
    client_purchases.error,
    client_meetings.error,
    client_activity_events.error,
    staff_users.error,
    suppliers.error,
    supplier_custom_fields.error,
    supplier_orders.error,
    supplier_products.error,
    competitors.error,
    competitor_products.error,
    transport_suppliers.error,
    transport_supplier_history.error,
    settings.error,
    conversation_scripts.error,
    conversation_script_steps.error,
    machine_catalog_items.error,
    machine_selling_points.error,
  ].filter(Boolean);
  if (errors.length) throw new Error(errors[0]!.message);
  return JSON.stringify(
    {
      exported_at: nowIso(),
      clients: clients.data,
      client_custom_fields: client_custom_fields.data,
      client_conversations: client_conversations.data,
      client_orders: client_orders.data,
      client_purchases: client_purchases.data,
      client_meetings: client_meetings.data,
      client_activity_events: client_activity_events.data,
      staff_users: staff_users.data,
      suppliers: suppliers.data,
      supplier_custom_fields: supplier_custom_fields.data,
      supplier_orders: supplier_orders.data,
      supplier_products: supplier_products.data,
      competitors: competitors.data,
      competitor_products: competitor_products.data,
      transport_suppliers: transport_suppliers.data,
      transport_supplier_history: transport_supplier_history.data,
      settings: settings.data,
      conversation_scripts: conversation_scripts.data,
      conversation_script_steps: conversation_script_steps.data,
      machine_catalog_items: machine_catalog_items.data,
      machine_selling_points: machine_selling_points.data,
    },
    null,
    2
  );
}
