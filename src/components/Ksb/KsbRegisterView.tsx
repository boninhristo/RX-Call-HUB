import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addConversation,
  createClient,
  getClientsPage,
  lookupClientsByEiks,
  normalizeEikKey,
  updateClientInContact,
  type Client,
  type ClientEikLookupRow,
} from "../../lib/db";
import {
  dedupeKsbListRows,
  ksbFetchFirmDetailByMemberId,
  ksbFetchListFirmsForm,
  ksbFirmDetailToClientDraft,
  ksbListRowMatchesKeyword,
  ksbPostListFirms,
  parseGroupOptionsFromListHtml,
  parseKsbFirmDetailHtml,
  parseKsbResultsTable,
  parseRegionOptionsFromListHtml,
  uniqueGroupTypeValuesInOrder,
  type KsbFirmDetail,
  type KsbGroupOption,
  type KsbListRow,
} from "../../lib/ksbRegister";
import {
  emitClientsChanged,
  openKsbWindow,
  readStandaloneWindowParam,
} from "../../lib/multiWindow";

interface KsbRegisterViewProps {
  onOpenClient?: (clientId: number, label: string) => void;
  /**
   * Когато е `true`, контейнерът заема пълна ширина (без `max-w-5xl`). Ползва се при
   * вграждане в split view или в самостоятелен прозорец.
   */
  compact?: boolean;
}

function nowLocalDatetimeInputValue(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface RowConversationDraft {
  type: "phone" | "in_person";
  date: string;
  notes: string;
}

function freshConversationDraft(): RowConversationDraft {
  return { type: "phone", date: nowLocalDatetimeInputValue(), notes: "" };
}

type AttachTarget = { kind: "new" } | { kind: "existing"; clientId: number };

function matchLabel(rows: ClientEikLookupRow[] | undefined): { text: string; tone: "muted" | "ok" | "warn" } {
  if (!rows || rows.length === 0) return { text: "Няма в базата", tone: "muted" };
  const contacted = rows.some((r) => r.in_contact === 1);
  const names = rows.map((r) => r.name).join(", ");
  if (rows.length > 1) {
    return {
      text: contacted ? `${rows.length} клиента (някой в контакт)` : `${rows.length} клиента (не в контакт)`,
      tone: contacted ? "warn" : "muted",
    };
  }
  if (contacted) return { text: `В базата: ${names} — в контакт`, tone: "ok" };
  return { text: `В базата: ${names} — не е в контакт`, tone: "warn" };
}

export function KsbRegisterView({ onOpenClient, compact = false }: KsbRegisterViewProps) {
  const isStandalone = readStandaloneWindowParam() === "ksb";
  const fullWidth = compact || isStandalone;

  const [tauriOk, setTauriOk] = useState<boolean | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [regions, setRegions] = useState<{ value: string; label: string }[]>([]);
  const [groups, setGroups] = useState<KsbGroupOption[]>([]);
  const [pod, setPod] = useState("");
  const [groupType, setGroupType] = useState("");

  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [listRows, setListRows] = useState<KsbListRow[]>([]);
  /** Филтър по ключова дума върху вече заредения списък (име, ЕИК, протокол, заб.) */
  const [listKeyword, setListKeyword] = useState("");
  const [eikMap, setEikMap] = useState<Map<string, ClientEikLookupRow[]>>(new Map());

  const [allCatLoading, setAllCatLoading] = useState(false);
  const [allCatProgress, setAllCatProgress] = useState<{ current: number; total: number } | null>(null);
  const allCatRunRef = useRef(0);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<KsbFirmDetail | null>(null);
  /** id_members на реда с разгънат детайл; `null` = затворено */
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [clientSearch, setClientSearch] = useState("");
  const [clientHits, setClientHits] = useState<Client[]>([]);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);

  const [addBusy, setAddBusy] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const detailFetchGen = useRef(0);

  /** Чернова на разговор за разгънатия ред (ресет при смяна на ред / след запис). */
  const [convDraft, setConvDraft] = useState<RowConversationDraft>(freshConversationDraft);
  /** Inline избор „нов или прикачи към съществуващ“ при дублиран ЕИК. */
  const [pickExisting, setPickExisting] = useState<{
    matches: ClientEikLookupRow[];
    chosenClientId: number | null;
  } | null>(null);

  const [openWindowBusy, setOpenWindowBusy] = useState(false);
  const [openWindowError, setOpenWindowError] = useState<string | null>(null);

  const displayRows = useMemo(() => {
    const term = listKeyword.trim();
    if (!term) return listRows;
    return listRows.filter((r) => ksbListRowMatchesKeyword(r, term));
  }, [listRows, listKeyword]);

  const loadFormMeta = useCallback(async () => {
    setInitError(null);
    try {
      const html = await ksbFetchListFirmsForm();
      setRegions(parseRegionOptionsFromListHtml(html));
      setGroups(parseGroupOptionsFromListHtml(html));
      setTauriOk(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setInitError(msg);
      setTauriOk(false);
    }
  }, []);

  useEffect(() => {
    void loadFormMeta();
  }, [loadFormMeta]);

  const runEikLookup = useCallback(async (eiks: string[]) => {
    const uniq = [...new Set(eiks.map((x) => x.trim()).filter(Boolean))];
    if (uniq.length === 0) {
      setEikMap(new Map());
      return;
    }
    try {
      const m = await lookupClientsByEiks(uniq);
      setEikMap(m);
    } catch {
      /* не изчистваме картата — иначе при грешка изчезват всички статуси */
    }
  }, []);

  const handleLoadList = async () => {
    if (!pod || !groupType) {
      setListError("Изберете област и категория.");
      return;
    }
    allCatRunRef.current++;
    setAllCatLoading(false);
    setAllCatProgress(null);
    setListLoading(true);
    setListError(null);
    detailFetchGen.current++;
    setListRows([]);
    setExpandedId(null);
    setDetail(null);
    try {
      const html = await ksbPostListFirms(pod, groupType);
      const rows = parseKsbResultsTable(html);
      setListRows(rows);
      await runEikLookup(rows.map((r) => r.eik));
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    } finally {
      setListLoading(false);
    }
  };

  const cancelLoadAllCategories = () => {
    allCatRunRef.current++;
    setAllCatLoading(false);
    setAllCatProgress(null);
  };

  const handleLoadAllCategoriesForPod = async () => {
    if (!pod) {
      setListError("Изберете област.");
      return;
    }
    const ordered = uniqueGroupTypeValuesInOrder(groups);
    if (ordered.length === 0) {
      setListError("Няма заредени категории от КСБ. Опитайте отново след зареждане на страницата.");
      return;
    }
    const runId = ++allCatRunRef.current;
    setAllCatLoading(true);
    setAllCatProgress({ current: 0, total: ordered.length });
    setListError(null);
    detailFetchGen.current++;
    setExpandedId(null);
    setDetail(null);
    setListRows([]);
    const acc: KsbListRow[] = [];
    const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
    try {
      for (let i = 0; i < ordered.length; i++) {
        if (runId !== allCatRunRef.current) {
          const partial = dedupeKsbListRows(acc);
          setListRows(partial);
          if (partial.length > 0) {
            setListError("Зареждането е прекратено. Показани са обработените категории.");
            await runEikLookup(partial.map((r) => r.eik));
          }
          setAllCatLoading(false);
          setAllCatProgress(null);
          return;
        }
        setAllCatProgress({ current: i + 1, total: ordered.length });
        const html = await ksbPostListFirms(pod, ordered[i]);
        acc.push(...parseKsbResultsTable(html));
        if (runId !== allCatRunRef.current) {
          const partial = dedupeKsbListRows(acc);
          setListRows(partial);
          if (partial.length > 0) {
            setListError("Зареждането е прекратено. Показани са обработените категории.");
            await runEikLookup(partial.map((r) => r.eik));
          }
          setAllCatLoading(false);
          setAllCatProgress(null);
          return;
        }
        await sleep(220);
      }
      if (runId !== allCatRunRef.current) return;
      const merged = dedupeKsbListRows(acc);
      setListRows(merged);
      if (merged.length > 0) await runEikLookup(merged.map((r) => r.eik));
    } catch (e) {
      if (runId === allCatRunRef.current) {
        setListError(e instanceof Error ? e.message : String(e));
        const partial = dedupeKsbListRows(acc);
        if (partial.length > 0) {
          setListRows(partial);
          await runEikLookup(partial.map((r) => r.eik));
        } else {
          setListRows([]);
        }
      }
    } finally {
      if (runId === allCatRunRef.current) {
        setAllCatLoading(false);
        setAllCatProgress(null);
      }
    }
  };

  const loadDetailForRow = async (row: KsbListRow) => {
    const gen = ++detailFetchGen.current;
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    setAddMsg(null);
    try {
      const html = await ksbFetchFirmDetailByMemberId(row.idMembers);
      if (gen !== detailFetchGen.current) return;
      const d = parseKsbFirmDetailHtml(html, row.idMembers);
      if (!d) throw new Error("Неуспешен парсинг на детайла.");
      setDetail(d);
      setDetailLoading(false);
      await runEikLookup(listRows.map((r) => r.eik));
    } catch (e) {
      if (gen !== detailFetchGen.current) return;
      setDetailError(e instanceof Error ? e.message : String(e));
    } finally {
      if (gen === detailFetchGen.current) setDetailLoading(false);
    }
  };

  const toggleRowDetail = (row: KsbListRow) => {
    if (expandedId === row.idMembers) {
      detailFetchGen.current++;
      setExpandedId(null);
      setDetail(null);
      setDetailError(null);
      setDetailLoading(false);
      setAddMsg(null);
      setConvDraft(freshConversationDraft());
      setPickExisting(null);
      return;
    }
    setExpandedId(row.idMembers);
    setConvDraft(freshConversationDraft());
    setPickExisting(null);
    setAddMsg(null);
    void loadDetailForRow(row);
  };

  useEffect(() => {
    const q = clientSearch.trim();
    if (q.length < 2) {
      setClientHits([]);
      return;
    }
    let cancelled = false;
    setClientSearchLoading(true);
    const t = window.setTimeout(() => {
      getClientsPage({
        page: 0,
        pageSize: 15,
        search: q,
        inContactFilter: "all",
        staffFilter: "all",
        sortColumn: "name",
        sortAscending: true,
      })
        .then(({ clients }) => {
          if (!cancelled) setClientHits(clients);
        })
        .catch(() => {
          if (!cancelled) setClientHits([]);
        })
        .finally(() => {
          if (!cancelled) setClientSearchLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [clientSearch]);

  const detailMatches = useMemo(() => {
    if (!detail) return [];
    return eikMap.get(normalizeEikKey(detail.eik)) ?? [];
  }, [detail, eikMap]);

  const performAddOrAttach = async (target: AttachTarget) => {
    if (!detail) return;
    const hasConv = convDraft.notes.trim().length > 0;
    setAddBusy(true);
    setAddMsg(null);
    try {
      let convDateIso: string | null = null;
      if (hasConv) {
        const parsed = new Date(convDraft.date);
        if (Number.isNaN(parsed.getTime())) {
          throw new Error("Невалидна дата на разговора.");
        }
        convDateIso = parsed.toISOString();
      }

      let clientId: number;
      let clientName: string;
      if (target.kind === "existing") {
        clientId = target.clientId;
        const existing = (eikMap.get(normalizeEikKey(detail.eik)) ?? []).find(
          (c) => c.id === clientId
        );
        clientName = existing?.name ?? `#${clientId}`;
        if (hasConv && convDateIso) {
          await addConversation(clientId, convDateIso, convDraft.type, convDraft.notes.trim());
        }
        await updateClientInContact(clientId, true);
      } else {
        const draft = ksbFirmDetailToClientDraft(detail);
        clientId = await createClient({ ...draft, in_contact: hasConv ? 1 : 0 });
        clientName = draft.name;
        if (hasConv && convDateIso) {
          await addConversation(clientId, convDateIso, convDraft.type, convDraft.notes.trim());
        }
      }

      const verb =
        target.kind === "existing"
          ? hasConv
            ? `Прикачен разговор + „в контакт“ за ${clientName} (#${clientId})`
            : `Маркиран „в контакт“: ${clientName} (#${clientId})`
          : hasConv
            ? `Добавен клиент #${clientId} (${clientName}) + разговор`
            : `Добавен клиент #${clientId}: ${clientName}`;
      setAddMsg(verb);

      const eiks = listRows.length > 0 ? [...listRows.map((r) => r.eik), detail.eik] : [detail.eik];
      await runEikLookup(eiks);

      setConvDraft(freshConversationDraft());
      setPickExisting(null);

      window.dispatchEvent(new CustomEvent("klienti-clients-changed"));
      void emitClientsChanged();
    } catch (e) {
      setAddMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setAddBusy(false);
    }
  };

  const handleAddClient = async () => {
    if (!detail) return;
    const matches = eikMap.get(normalizeEikKey(detail.eik)) ?? [];
    if (matches.length === 0) {
      await performAddOrAttach({ kind: "new" });
      return;
    }
    if (matches.length === 1) {
      const m = matches[0];
      const ok = window.confirm(
        `В базата вече има клиент: ${m.name}` +
          (m.in_contact ? " (в контакт)" : "") +
          `\n\nОК = прикачи към съществуващия` +
          `\nОтказ = създай нов запис`
      );
      await performAddOrAttach(ok ? { kind: "existing", clientId: m.id } : { kind: "new" });
      return;
    }
    setPickExisting({
      matches,
      chosenClientId: matches.find((m) => m.in_contact === 1)?.id ?? matches[0].id,
    });
    setAddMsg(null);
  };

  const handleOpenInWindow = async () => {
    setOpenWindowBusy(true);
    setOpenWindowError(null);
    try {
      await openKsbWindow();
    } catch (e) {
      setOpenWindowError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpenWindowBusy(false);
    }
  };

  const toneClass = (tone: "muted" | "ok" | "warn") =>
    tone === "ok"
      ? "text-emerald-400/90"
      : tone === "warn"
        ? "text-amber-400/90"
        : "text-[var(--color-accent)]";

  if (tauriOk === false) {
    return (
      <div className="max-w-xl space-y-3 text-sm text-[var(--color-accent)]">
        <h1 className="text-lg font-medium text-[var(--color-text-bright)]">КСБ регистър</h1>
        <p>
          Този изглед изисква <strong>десктоп приложението (Tauri)</strong>, за да вика register.ksb.bg без CORS.
        </p>
        {initError && <p className="text-red-300/90">Грешка: {initError}</p>}
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${fullWidth ? "" : "max-w-5xl"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium text-[var(--color-text-bright)]">КСБ — регистър на строители</h1>
          <p className="text-xs text-[var(--color-accent)] mt-1">
            Данни от{" "}
            <a className="underline hover:text-[var(--color-text)]" href="https://register.ksb.bg/listFirms.php">
              register.ksb.bg
            </a>
            . Зареждане при всяко действие; запис във вашата база само с „Добави в клиенти“.
          </p>
        </div>
        {!isStandalone && (
          <div className="flex flex-col items-end gap-1 shrink-0">
            <button
              type="button"
              onClick={() => void handleOpenInWindow()}
              disabled={openWindowBusy}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-xs hover:bg-[var(--color-bg-card)]/80 disabled:opacity-50"
              title="Отвори КСБ в отделен Tauri прозорец"
            >
              {openWindowBusy ? "Отваряне…" : "Отвори в отделен прозорец"}
            </button>
            {openWindowError && (
              <span className="text-[10px] text-red-300/90 max-w-[14rem] text-right">
                {openWindowError}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-[var(--color-bg-card)] p-4 space-y-2 max-w-2xl">
        <label className="block text-xs text-[var(--color-accent)]">Търсене в заредения списък</label>
        <input
          type="text"
          value={listKeyword}
          onChange={(e) => setListKeyword(e.target.value)}
          placeholder="Име на фирма, ЕИК, протокол…"
          disabled={listRows.length === 0}
          className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-sm text-[var(--color-text)] disabled:opacity-50"
        />
        <p className="text-[10px] text-[var(--color-accent)] leading-snug">
          Филтърът е само върху вече показаните редове (една категория или обединени „всички категории“ за областта). Не търси телефон/адрес — те не са в списъчния HTML на КСБ.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--color-bg-card)] p-4 space-y-4">
        <p className="text-sm text-[var(--color-text-bright)]">Списък строители</p>
        {initError && <p className="text-sm text-red-300/90">{initError}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-accent)] mb-1">Област</label>
            <select
              value={pod}
              onChange={(e) => {
                setPod(e.target.value);
                setGroupType("");
              }}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-sm text-[var(--color-text)]"
            >
              <option value="">— изберете —</option>
              {regions.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-accent)] mb-1">Категория / група</label>
            <select
              value={groupType}
              onChange={(e) => setGroupType(e.target.value)}
              disabled={!pod}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-sm text-[var(--color-text)] disabled:opacity-50"
            >
              <option value="">— изберете —</option>
              {groups.map((g, idx) => (
                <option key={`${idx}-${g.value}`} value={g.value}>
                  {g.label.length > 90 ? `${g.label.slice(0, 90)}…` : g.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleLoadList()}
            disabled={listLoading || allCatLoading || !pod || !groupType || tauriOk !== true}
            className="px-4 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm hover:bg-[var(--color-bg-card)]/80 disabled:opacity-50"
          >
            {listLoading ? "Зареждане…" : "Покажи строителите"}
          </button>
          <button
            type="button"
            onClick={() => void handleLoadAllCategoriesForPod()}
            disabled={listLoading || allCatLoading || !pod || groups.length === 0 || tauriOk !== true}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)]/20 text-[var(--color-text-bright)] text-sm border border-[var(--color-accent)]/40 hover:bg-[var(--color-accent)]/30 disabled:opacity-50"
          >
            {allCatLoading ? "Зареждане на всички категории…" : "Зареди всички категории за областта"}
          </button>
          {allCatLoading && (
            <button
              type="button"
              onClick={cancelLoadAllCategories}
              className="px-3 py-2 rounded-lg text-sm text-red-300 border border-red-400/40 hover:bg-red-500/10"
            >
              Отказ
            </button>
          )}
        </div>
        {allCatProgress && (
          <p className="text-xs text-[var(--color-accent)]">
            Категория {allCatProgress.current} / {allCatProgress.total}
          </p>
        )}
        {listRows.length > 0 && listKeyword.trim() && (
          <p className="text-xs text-[var(--color-accent)]">
            Показани {displayRows.length} от {listRows.length} реда
          </p>
        )}
        {listError && <p className="text-sm text-red-300/90">{listError}</p>}

        {listRows.length > 0 && (
          <div className="overflow-x-auto border border-[var(--color-bg-card)] rounded-lg">
            <table className="min-w-full text-xs text-left">
              <thead className="bg-[var(--color-bg-card)]/60 text-[var(--color-accent)]">
                <tr>
                  <th className="px-2 py-2">#</th>
                  <th className="px-2 py-2">ЕИК</th>
                  <th className="px-2 py-2">В базата</th>
                  <th className="px-2 py-2">Строител</th>
                  <th className="px-2 py-2">Протокол</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-[var(--color-accent)]">
                      Няма редове, които да съвпадат с филтъра. Изчисти полето за търсене или смени ключовата дума.
                    </td>
                  </tr>
                ) : null}
                {displayRows.map((row) => {
                  const m = matchLabel(eikMap.get(normalizeEikKey(row.eik)));
                  const open = expandedId === row.idMembers;
                  return (
                    <Fragment key={`${row.idMembers}-${row.rowNo}`}>
                      <tr
                        className={`border-t border-[var(--color-bg-card)] ${
                          open ? "bg-[var(--color-accent)]/10" : ""
                        }`}
                      >
                        <td className="px-2 py-2 tabular-nums">{row.rowNo}</td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            className="text-[var(--color-accent)] underline hover:text-[var(--color-text-bright)]"
                            onClick={() => toggleRowDetail(row)}
                            title={open ? "Затвори детайл" : "Покажи детайл"}
                          >
                            {row.eik}
                          </button>
                        </td>
                        <td className={`px-2 py-2 ${toneClass(m.tone)}`}>{m.text}</td>
                        <td className="px-2 py-2 text-[var(--color-text)]">{row.builderName}</td>
                        <td className="px-2 py-2 text-[var(--color-accent)]">{row.protocol}</td>
                      </tr>
                      {open && (
                        <tr className="border-t border-[var(--color-bg-card)] bg-[var(--color-bg-primary)]/35">
                          <td colSpan={5} className="p-0 align-top">
                            <div className="p-3 space-y-3 text-xs">
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => toggleRowDetail(row)}
                                  className="px-2 py-1 rounded-md bg-[var(--color-bg-card)] text-[var(--color-text)] hover:bg-[var(--color-bg-card)]/80"
                                >
                                  Затвори
                                </button>
                              </div>
                              {detailLoading && (
                                <p className="text-[var(--color-accent)]">Зареждане…</p>
                              )}
                              {detailError && <p className="text-red-300/90">{detailError}</p>}
                              {detail && !detailLoading && (
                                <>
                                  <div className={`text-sm ${toneClass(matchLabel(detailMatches).tone)}`}>
                                    {matchLabel(detailMatches).text}
                                    {detailMatches.map((c) => (
                                      <span key={c.id} className="ml-2">
                                        <button
                                          type="button"
                                          className="underline text-[var(--color-accent)]"
                                          onClick={() => onOpenClient?.(c.id, c.name)}
                                        >
                                          Отвори #{c.id}
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                                    <div>
                                      <dt className="text-[var(--color-accent)]">ЕИК</dt>
                                      <dd className="text-[var(--color-text)]">{detail.eik}</dd>
                                    </div>
                                    <div>
                                      <dt className="text-[var(--color-accent)]">Наименование</dt>
                                      <dd className="text-[var(--color-text)]">{detail.tradeName}</dd>
                                    </div>
                                    <div>
                                      <dt className="text-[var(--color-accent)]">Правна форма</dt>
                                      <dd className="text-[var(--color-text)]">{detail.legalForm}</dd>
                                    </div>
                                    <div>
                                      <dt className="text-[var(--color-accent)]">Управител / контакт</dt>
                                      <dd className="text-[var(--color-text)]">
                                        {detail.representatives
                                          .filter((r) => r.position.toLowerCase().includes("управител"))
                                          .map((r) =>
                                            [r.firstName, r.middleName, r.lastName].filter(Boolean).join(" ")
                                          )
                                          .join("; ") || "—"}
                                      </dd>
                                    </div>
                                    <div className="sm:col-span-2">
                                      <dt className="text-[var(--color-accent)]">Адрес (седалище)</dt>
                                      <dd className="text-[var(--color-text)]">
                                        {[
                                          detail.region,
                                          detail.municipality,
                                          detail.city,
                                          detail.postalCode,
                                          detail.street,
                                          detail.streetNo,
                                        ]
                                          .filter(Boolean)
                                          .join(", ")}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-[var(--color-accent)]">Телефон</dt>
                                      <dd className="text-[var(--color-text)]">
                                        {detail.phoneCode ? `${detail.phoneCode} / ` : ""}
                                        {detail.phone || "—"}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-[var(--color-accent)]">Имейл</dt>
                                      <dd className="text-[var(--color-text)]">{detail.email || "—"}</dd>
                                    </div>
                                    <div className="sm:col-span-2">
                                      <dt className="text-[var(--color-accent)]">
                                        7. Текстова информация за строителя{" "}
                                        <span className="opacity-70">(същото се записва в Notes)</span>
                                      </dt>
                                      <dd className="text-[var(--color-text)] whitespace-pre-wrap text-[11px] leading-relaxed max-h-48 overflow-y-auto rounded-lg border border-[var(--color-bg-card)] p-2 bg-[var(--color-bg-primary)]/40">
                                        {detail.descriptionText?.trim() ? detail.descriptionText : "—"}
                                      </dd>
                                    </div>
                                  </dl>
                                  <div>
                                    <label className="block text-[var(--color-accent)] mb-1">
                                      Търсене във вашите клиенти
                                    </label>
                                    <input
                                      value={clientSearch}
                                      onChange={(e) => setClientSearch(e.target.value)}
                                      placeholder="Име, ЕИК, фирма…"
                                      className="w-full max-w-md px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-sm text-[var(--color-text)]"
                                    />
                                    {clientSearchLoading && (
                                      <p className="text-[var(--color-accent)] mt-1">Търсене…</p>
                                    )}
                                    {clientHits.length > 0 && (
                                      <ul className="mt-2 border border-[var(--color-bg-card)] rounded-lg divide-y divide-[var(--color-bg-card)] max-w-md">
                                        {clientHits.map((c) => (
                                          <li key={c.id} className="px-2 py-1.5 flex justify-between gap-2">
                                            <span className="text-[var(--color-text)] truncate">
                                              {c.name}
                                              {c.eik ? ` · ${c.eik}` : ""}
                                            </span>
                                            <button
                                              type="button"
                                              className="shrink-0 text-[var(--color-accent)] underline"
                                              onClick={() => onOpenClient?.(c.id, c.name)}
                                            >
                                              Отвори
                                            </button>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                  <div className="rounded-lg border border-[var(--color-bg-card)] p-2 space-y-2">
                                    <p className="text-[var(--color-text-bright)] text-sm">
                                      Разговор (по избор)
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      <select
                                        value={convDraft.type}
                                        onChange={(e) =>
                                          setConvDraft((d) => ({
                                            ...d,
                                            type: e.target.value as "phone" | "in_person",
                                          }))
                                        }
                                        className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-sm text-[var(--color-text)]"
                                      >
                                        <option value="phone">Телефон</option>
                                        <option value="in_person">На място</option>
                                      </select>
                                      <input
                                        type="datetime-local"
                                        value={convDraft.date}
                                        onChange={(e) =>
                                          setConvDraft((d) => ({ ...d, date: e.target.value }))
                                        }
                                        className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-sm text-[var(--color-text)]"
                                      />
                                    </div>
                                    <textarea
                                      value={convDraft.notes}
                                      onChange={(e) =>
                                        setConvDraft((d) => ({ ...d, notes: e.target.value }))
                                      }
                                      rows={4}
                                      placeholder="Какво се обсъди…"
                                      className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-[11px] leading-relaxed text-[var(--color-text)] placeholder:text-[var(--color-accent)]/60 resize-y"
                                    />
                                    <p className="text-[10px] text-[var(--color-accent)] leading-snug">
                                      Ако е попълнен: при „Добави в клиенти“ записва разговора и маркира клиента „в контакт“. Ако е празен — само добавя клиента.
                                    </p>
                                  </div>
                                  {pickExisting && (
                                    <div className="rounded-lg border border-amber-400/40 p-2 space-y-2 bg-amber-500/5">
                                      <p className="text-[var(--color-text-bright)] text-sm">
                                        В базата вече има {pickExisting.matches.length} клиента с този ЕИК
                                      </p>
                                      <ul className="space-y-1">
                                        {pickExisting.matches.map((m) => (
                                          <li key={m.id} className="flex items-start gap-2">
                                            <input
                                              type="radio"
                                              id={`pick-${m.id}`}
                                              name="ksb-pick-existing"
                                              checked={pickExisting.chosenClientId === m.id}
                                              onChange={() =>
                                                setPickExisting((p) =>
                                                  p ? { ...p, chosenClientId: m.id } : p
                                                )
                                              }
                                              className="mt-0.5"
                                            />
                                            <label
                                              htmlFor={`pick-${m.id}`}
                                              className="text-[var(--color-text)] cursor-pointer"
                                            >
                                              {m.name}
                                              <span className="text-[var(--color-accent)] ml-2">
                                                #{m.id}
                                                {m.in_contact === 1 ? " · в контакт" : ""}
                                              </span>
                                            </label>
                                          </li>
                                        ))}
                                      </ul>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <button
                                          type="button"
                                          disabled={addBusy || pickExisting.chosenClientId == null}
                                          onClick={() => {
                                            if (pickExisting.chosenClientId == null) return;
                                            void performAddOrAttach({
                                              kind: "existing",
                                              clientId: pickExisting.chosenClientId,
                                            });
                                          }}
                                          className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium disabled:opacity-50"
                                        >
                                          Прикачи към избрания
                                        </button>
                                        <button
                                          type="button"
                                          disabled={addBusy}
                                          onClick={() => void performAddOrAttach({ kind: "new" })}
                                          className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm hover:bg-[var(--color-bg-card)]/80 disabled:opacity-50"
                                        >
                                          Създай нов запис
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setPickExisting(null)}
                                          className="px-2 py-1 rounded-md text-xs text-[var(--color-accent)] hover:text-[var(--color-text-bright)]"
                                        >
                                          Отказ
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={addBusy}
                                      onClick={() => void handleAddClient()}
                                      className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium disabled:opacity-50"
                                    >
                                      {addBusy ? "Запис…" : "Добави в клиенти"}
                                    </button>
                                    {addMsg && (
                                      <span className="text-[var(--color-accent)]">{addMsg}</span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
