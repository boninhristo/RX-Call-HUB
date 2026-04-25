import { useState, useEffect, useRef } from "react";
import { formatDateTime } from "../../lib/format";
import {
  getClientsPage,
  fetchAllClientIdsForClientsList,
  getClient,
  createClient,
  createClientsBulk,
  updateClient,
  updateClientInContact,
  deleteClient,
  listDeletedClients,
  listStaffUsers,
  updateClientsVisibility,
  type Client,
  type ClientDraft,
  type ClientsSortColumn,
  type DeletedClient,
  type StaffUser,
} from "../../lib/db";
import type { AppRole } from "../../lib/auth";
import { ClientForm } from "./ClientForm";
import { ClientDetail } from "./ClientDetail";
import { useTableSelection } from "../../hooks/useTableSelection";

const CLIENTS_PAGE_SIZE = 200;

interface ClientsViewProps {
  role: AppRole;
  initialSelectedId?: number;
  onNavigated?: () => void;
}

export function ClientsView({ role, initialSelectedId, onNavigated }: ClientsViewProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [deletedClients, setDeletedClients] = useState<DeletedClient[]>([]);
  const [search, setSearch] = useState("");
  const [inContactFilter, setInContactFilter] = useState<"all" | "contacted" | "not_contacted">("all");
  const [staffFilter, setStaffFilter] = useState("all");
  const [selected, setSelected] = useState<Client | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [visibilityTarget, setVisibilityTarget] = useState("everyone");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectingAllFiltered, setSelectingAllFiltered] = useState(false);
  const [sortColumn, setSortColumn] = useState<ClientsSortColumn | null>(null);
  const [sortAscending, setSortAscending] = useState(true);
  const loadClientsSeq = useRef(0);

  const resetListSort = () => {
    setSortColumn(null);
    setSortAscending(true);
  };

  /** Начален изглед: без търсене, филтри, сортиране; активни клиенти; затворени форми/импорт. */
  const handleResetTable = () => {
    setSearch("");
    setInContactFilter("all");
    setStaffFilter("all");
    resetListSort();
    setPageIndex(0);
    setShowDeleted(false);
    setShowImport(false);
    setShowForm(false);
    setEditing(null);
    clearAll();
  };

  const loadClients = async () => {
    const seq = ++loadClientsSeq.current;
    try {
      if (role === "admin" && showDeleted) {
        const deleted = await listDeletedClients();
        if (seq !== loadClientsSeq.current) return;
        const term = search.trim().toLowerCase();
        setDeletedClients(
          term
            ? deleted.filter((c) =>
                `${c.name} ${c.company ?? ""} ${c.turnover ?? ""} ${c.phone ?? ""} ${c.email ?? ""}`
                  .toLowerCase()
                  .includes(term)
              )
            : deleted
        );
        setClients([]);
        setTotalCount(0);
        return;
      }
      const { clients: list, total } = await getClientsPage({
        page: pageIndex,
        pageSize: CLIENTS_PAGE_SIZE,
        search,
        inContactFilter,
        staffFilter: role === "admin" ? staffFilter : "all",
        sortColumn,
        sortAscending,
      });
      if (seq !== loadClientsSeq.current) return;
      setClients(list);
      setTotalCount(total);
      setDeletedClients([]);
    } catch (e) {
      if (seq !== loadClientsSeq.current) return;
      console.error(e);
      alert(e instanceof Error ? e.message : "Грешка при зареждане на клиентите.");
    }
  };

  useEffect(() => {
    loadClients();
  }, [search, inContactFilter, staffFilter, showDeleted, role, pageIndex, sortColumn, sortAscending]);

  useEffect(() => {
    if (role !== "admin") return;
    listStaffUsers().then(setStaffUsers).catch(() => setStaffUsers([]));
  }, [role]);

  useEffect(() => {
    if (initialSelectedId) {
      getClient(initialSelectedId).then((c) => {
        if (c) setSelected(c);
        onNavigated?.();
      });
    }
  }, [initialSelectedId]);

  const handleSort = (col: ClientsSortColumn) => {
    if (showDeleted) return;
    if (col === "access" && role !== "admin") return;
    setPageIndex(0);
    if (sortColumn === col) {
      setSortAscending((a) => !a);
    } else {
      setSortColumn(col);
      setSortAscending(col === "turnover" ? false : true);
    }
  };

  const handleCreate = async (data: any) => {
    await createClient(data);
    setShowForm(false);
    setPageIndex(0);
    resetListSort();
    loadClients();
  };

  const handleUpdate = async (data: any) => {
    if (editing) {
      await updateClient(editing.id, data);
      setEditing(null);
      if (selected?.id === editing.id) setSelected(null);
      loadClients();
    }
  };

  const handleDelete = (id: number) => {
    setPendingDeleteId(id);
  };

  const confirmDeleteClient = async () => {
    if (pendingDeleteId == null) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    await deleteClient(id);
    if (selected?.id === id) setSelected(null);
    loadClients();
  };

  const { selectedIds, toggle, toggleAll, clearAll, selectAllByIds, isSelected, getSelectedIds } =
    useTableSelection<Client>();

  const totalPages = Math.max(1, Math.ceil(totalCount / CLIENTS_PAGE_SIZE));
  const rangeFrom = totalCount === 0 ? 0 : pageIndex * CLIENTS_PAGE_SIZE + 1;
  const rangeTo = Math.min((pageIndex + 1) * CLIENTS_PAGE_SIZE, totalCount);

  const handleSelectAllFiltered = async () => {
    if (showDeleted) return;
    setSelectingAllFiltered(true);
    try {
      const ids = await fetchAllClientIdsForClientsList({
        search,
        inContactFilter,
        staffFilter: role === "admin" ? staffFilter : "all",
      });
      selectAllByIds(ids);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Грешка при избор на всички.");
    } finally {
      setSelectingAllFiltered(false);
    }
  };

  const handleToggleInContact = async (e: React.MouseEvent, c: Client) => {
    e.stopPropagation();
    const next = (c.in_contact ?? 0) ? 0 : 1;
    await updateClientInContact(c.id, next === 1);
    setClients((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, in_contact: next } : x))
    );
    if (selected?.id === c.id) setSelected({ ...selected, in_contact: next });
  };

  const handleBulkDelete = async () => {
    const ids = getSelectedIds();
    if (ids.length === 0 || !confirm(`Delete ${ids.length} selected client(s)?`)) return;
    for (const id of ids) {
      await deleteClient(id);
      if (selected?.id === id) setSelected(null);
    }
    clearAll();
    loadClients();
  };

  const handleBulkSetInContact = async (value: boolean) => {
    const ids = getSelectedIds();
    if (ids.length === 0) return;
    for (const id of ids) {
      await updateClientInContact(id, value);
    }
    setClients((prev) =>
      prev.map((x) => (ids.includes(x.id) ? { ...x, in_contact: value ? 1 : 0 } : x))
    );
    if (selected && ids.includes(selected.id)) setSelected({ ...selected, in_contact: value ? 1 : 0 });
    clearAll();
    loadClients();
  };

  const handleBulkVisibility = async () => {
    const ids = getSelectedIds();
    if (ids.length === 0 || role !== "admin") return;
    if (visibilityTarget.startsWith("staff:")) {
      const staffUserId = parseInt(visibilityTarget.slice(6), 10);
      if (!Number.isFinite(staffUserId)) return;
      await updateClientsVisibility(ids, { scope: "staff_only", staffUserId });
    } else if (visibilityTarget === "admin_only") {
      await updateClientsVisibility(ids, { scope: "admin_only" });
    } else {
      await updateClientsVisibility(ids, { scope: "everyone" });
    }
    clearAll();
    loadClients();
  };

  function pastedHeaderToField(h: string): keyof ClientDraft | null {
    const k = String(h ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    const map: Record<string, keyof ClientDraft> = {
      name: "name",
      име: "name",
      company: "company",
      фирма: "company",
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

  const parseImportRows = (text: string): ClientDraft[] => {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return [];
    const rows = lines.map((l) => l.split(/\t/).map((c) => c.trim()));
    const first = rows[0] ?? [];
    const headerTokens = new Set([
      "name",
      "име",
      "company",
      "фирма",
      "turnover",
      "оборот",
      "phone",
      "email",
      "address",
      "eik",
      "vat",
      "vat number",
      "contact person",
      "bank account",
      "notes",
    ]);
    const looksLikeHeader =
      first.some((cell) => headerTokens.has(String(cell).trim().toLowerCase().replace(/\s+/g, " "))) &&
      !/^\d/.test(String(first[0] ?? "").trim());

    const draftKeys: (keyof ClientDraft)[] = [
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

    let colIndex: Partial<Record<keyof ClientDraft, number>> = {};
    let dataRows: string[][];
    if (looksLikeHeader) {
      first.forEach((h, i) => {
        const f = pastedHeaderToField(String(h));
        if (f && colIndex[f] === undefined) colIndex[f] = i;
      });
      dataRows = rows.slice(1);
    } else {
      const legacy: (keyof ClientDraft)[] = [
        "name",
        "company",
        "phone",
        "email",
        "address",
        "eik",
        "vat_number",
        "contact_person",
        "bank_account",
        "notes",
      ];
      legacy.forEach((k, i) => {
        colIndex[k] = i;
      });
      dataRows = rows;
    }

    if (colIndex.name === undefined) return [];

    return dataRows
      .filter((r) => r[colIndex.name!]?.trim())
      .map((r) => {
        const o: Record<string, string | null | number> = { in_contact: 0 };
        for (const k of draftKeys) {
          const ci = colIndex[k];
          o[k] = ci !== undefined && r[ci] !== undefined && String(r[ci]).trim() !== "" ? String(r[ci]).trim() : null;
        }
        return o as ClientDraft;
      });
  };

  const handleImport = async () => {
    const items = parseImportRows(importText);
    if (items.length === 0) {
      alert("No valid rows. Paste tab-separated data (e.g. from Excel). First row can be headers.");
      return;
    }
    const n = await createClientsBulk(items);
    setShowImport(false);
    setImportText("");
    setPageIndex(0);
    resetListSort();
    loadClients();
    alert(`Imported ${n} client(s).`);
  };

  if (selected) {
    return (
      <ClientDetail
        client={selected}
        onBack={() => { setSelected(null); onNavigated?.(); }}
        onUpdated={loadClients}
      />
    );
  }

  const sortThTitle = (col: ClientsSortColumn) =>
    col === "turnover"
      ? "Първи клик: от голямо към малко (текстово сортиране). Втори: обратно."
      : col === "access"
        ? "По полетата за видимост в базата. Първи клик: А→Я по код; втори: обратно."
        : "Първи клик: А→Я. Втори: Я→А.";

  function ClientSortTh(col: ClientsSortColumn, label: string, extraClass = "") {
    const active = !showDeleted && sortColumn === col;
    return (
      <th
        className={`px-3 py-1.5 font-medium ${extraClass} ${
          !showDeleted ? "cursor-pointer select-none hover:opacity-90" : ""
        }`}
        title={!showDeleted ? sortThTitle(col) : undefined}
        onClick={(e) => {
          e.stopPropagation();
          handleSort(col);
        }}
      >
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          {label}
          {active && (
            <span className="text-[10px] text-[var(--color-text-bright)]" aria-hidden>
              {sortAscending ? "▲" : "▼"}
            </span>
          )}
        </span>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-medium text-[var(--color-text-bright)]">
          {showDeleted ? "Deleted Clients" : "Clients"}
        </h1>
        <div className="flex gap-2 flex-wrap items-center">
          {!showDeleted && (
            <select
              value={inContactFilter}
              onChange={(e) => {
                setPageIndex(0);
                setInContactFilter(e.target.value as "all" | "contacted" | "not_contacted");
              }}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
            >
              <option value="all">В КОНТАКТ: All</option>
              <option value="not_contacted">В КОНТАКТ: Not contacted</option>
              <option value="contacted">В КОНТАКТ: Contacted</option>
            </select>
          )}
          {!showDeleted && role === "admin" && (
            <select
              value={staffFilter}
              onChange={(e) => {
                setPageIndex(0);
                setStaffFilter(e.target.value);
              }}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
            >
              <option value="all">СЛУЖИТЕЛ: All</option>
              {staffUsers.map((s) => (
                <option key={`created-${s.id}`} value={`created:${s.id}`}>
                  СЪЗДАЛ: {s.display_name || s.username}
                </option>
              ))}
              {staffUsers.map((s) => (
                <option key={`access-${s.id}`} value={`access:${s.id}`}>
                  ИМА ДОСТЪП: {s.display_name || s.username}
                </option>
              ))}
            </select>
          )}
          {!showDeleted && (
            <button
              onClick={() => setShowImport(true)}
              className="px-4 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm font-medium hover:bg-[var(--color-bg-card)]/80 border border-[var(--color-bg-card)]"
            >
              Import
            </button>
          )}
          <input
            type="search"
            placeholder="Search..."
            value={search}
            onChange={(e) => {
              setPageIndex(0);
              setSearch(e.target.value);
            }}
            className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-[var(--color-text)] placeholder:text-[var(--color-accent)]/60 focus:outline-none focus:border-[var(--color-accent)] w-48"
          />
          <button
            type="button"
            onClick={handleResetTable}
            title="Изчиства търсене, филтри по контакт/служител и сортиране; връща към активни клиенти."
            className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm font-medium hover:bg-[var(--color-bg-card)]/80 border border-[var(--color-bg-card)]"
          >
            Начало
          </button>
          {role === "admin" && (
            <button
              onClick={() => {
                setPageIndex(0);
                setShowDeleted((v) => !v);
                clearAll();
              }}
              className="px-4 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm font-medium hover:bg-[var(--color-bg-card)]/80 border border-[var(--color-bg-card)]"
            >
              {showDeleted ? "Back to active" : "Deleted clients"}
            </button>
          )}
          {!showDeleted && (
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium hover:bg-[var(--color-accent-light)]"
            >
              Add Client
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="p-4 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-bg-card)]">
          <ClientForm
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {editing && (
        <div className="p-4 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-bg-card)]">
          <ClientForm
            client={editing}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {selectedIds.size > 0 && !showDeleted && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-bg-card)]">
          <span className="text-sm text-[var(--color-accent)]">
            Избрани: {selectedIds.size}
            {totalCount > 0 ? ` · по филтъра: ${totalCount}` : ""}
          </span>
          <button
            type="button"
            onClick={() => void handleSelectAllFiltered()}
            disabled={selectingAllFiltered || totalCount === 0}
            className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-xs font-medium hover:bg-[var(--color-bg-card)]/80 disabled:opacity-50"
          >
            {selectingAllFiltered ? "Зареждане…" : `Маркирай всички (${totalCount})`}
          </button>
          <button
            onClick={() => handleBulkSetInContact(true)}
            className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-xs font-medium hover:bg-[var(--color-bg-card)]/80"
          >
            Set IN CONTACT
          </button>
          <button
            onClick={() => handleBulkSetInContact(false)}
            className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-xs font-medium hover:bg-[var(--color-bg-card)]/80"
          >
            Set NOT IN CONTACT
          </button>
          <button
            onClick={handleBulkDelete}
            className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30"
          >
            Delete selected
          </button>
          {role === "admin" && (
            <>
              <select
                value={visibilityTarget}
                onChange={(e) => setVisibilityTarget(e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-xs"
              >
                <option value="everyone">Access: Everyone</option>
                <option value="admin_only">Access: Admin only</option>
                {staffUsers.map((s) => (
                  <option key={s.id} value={`staff:${s.id}`}>
                    Access: {s.display_name || s.username}
                  </option>
                ))}
              </select>
              <button
                onClick={handleBulkVisibility}
                className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-xs font-medium hover:bg-[var(--color-bg-card)]/80"
              >
                Apply access
              </button>
            </>
          )}
          <button
            onClick={clearAll}
            className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-xs"
          >
            Clear selection
          </button>
        </div>
      )}

      {showImport && (
        <div className="p-4 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-bg-card)]">
          <h3 className="text-sm font-medium text-[var(--color-text-bright)] mb-2">
            Import clients (paste from Excel)
          </h3>
          <p className="text-xs text-[var(--color-accent)]/80 mb-2">
            Paste tab-separated data. Columns: Name, Company, Turnover (optional), Phone, Email, Address, EIK, VAT, Contact Person, Bank Account, Notes. With headers, columns can be in any order; without headers, use the old fixed order (no Turnover column).
          </p>
          <p className="text-xs text-[var(--color-accent)]/60 mb-2">
            За много редове (хиляди) по-надеждно е .xlsx импорт от терминал:{" "}
            <code className="text-[var(--color-text-bright)]">npm run import-clients -- &quot;C:\\…\\файл.xlsx&quot;</code>
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste your data here..."
            rows={8}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-[var(--color-text)] placeholder:text-[var(--color-accent)]/60 focus:outline-none focus:border-[var(--color-accent)] resize-none font-mono text-sm"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleImport}
              className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium"
            >
              Import
            </button>
            <button
              onClick={() => { setShowImport(false); setImportText(""); }}
              className="px-4 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[var(--color-bg-card)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--color-bg-secondary)] text-[var(--color-accent)] text-left">
              {!showDeleted && (
                <th className="px-3 py-1.5 w-10" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={clients.length > 0 && clients.every((c) => isSelected(c.id))} onChange={() => toggleAll(clients)} className="rounded border-[var(--color-bg-card)]" />
                </th>
              )}
              <th className="px-3 py-1.5 font-medium w-24">В КОНТАКТ</th>
              {ClientSortTh("name", "Name")}
              {ClientSortTh("company", "Company")}
              {ClientSortTh("turnover", "Turnover", "max-w-[100px]")}
              <th className="px-3 py-1.5 font-medium">Phone</th>
              <th className="px-3 py-1.5 font-medium">Email</th>
              {showDeleted ? (
                <th className="px-3 py-1.5 font-medium w-28">Deleted at</th>
              ) : (
                ClientSortTh("address", "Address", "w-28")
              )}
              {showDeleted && <th className="px-3 py-1.5 font-medium">Deleted by</th>}
              {!showDeleted && role === "admin" && ClientSortTh("access", "Access")}
              <th className="px-3 py-1.5 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {(showDeleted ? deletedClients : clients).map((c, idx) => (
              <tr
                key={c.id}
                className="border-t border-[var(--color-bg-card)] hover:bg-[var(--color-bg-card)]/30 cursor-pointer"
                onClick={() => !showDeleted && setSelected(c)}
              >
                {!showDeleted && (
                  <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected(c.id)}
                      onChange={() => {}}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(c.id, idx, clients, e.shiftKey);
                      }}
                      className="rounded border-[var(--color-bg-card)]"
                    />
                  </td>
                )}
                <td
                  className="px-3 py-1.5"
                  onClick={(e) => !showDeleted && handleToggleInContact(e, c)}
                  title="В КОНТАКТ (click to toggle)"
                >
                  <span
                    className={`inline-block w-4 h-4 rounded-full cursor-pointer ${
                      (c.in_contact ?? 0) ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <div className="text-[10px] text-[var(--color-accent)]/60">{formatDateTime(c.last_activity || c.updated_at || c.created_at)}</div>
                  <div className="text-[var(--color-text-bright)]">{c.name}</div>
                </td>
                <td className="px-3 py-1.5 text-[var(--color-text)]">{c.company || "—"}</td>
                <td
                  className="px-3 py-1.5 text-[var(--color-text)] max-w-[120px] truncate"
                  title={c.turnover || undefined}
                >
                  {c.turnover || "—"}
                </td>
                <td className="px-3 py-1.5 text-[var(--color-text)]">{c.phone || "—"}</td>
                <td className="px-3 py-1.5 text-[var(--color-text)]">{c.email || "—"}</td>
                {!showDeleted ? (
                  <td className="px-3 py-1.5 text-[var(--color-text)]" title={c.address || undefined}>
                    {c.address ? (c.address.length > 10 ? `${c.address.slice(0, 10)}…` : c.address) : "—"}
                  </td>
                ) : (
                  <td className="px-3 py-1.5 text-[var(--color-text)]">
                    {c.deleted_at ? formatDateTime(c.deleted_at) : "—"}
                  </td>
                )}
                {showDeleted && (
                  <td className="px-3 py-1.5 text-[var(--color-text)]">
                    {c.deleted_by_role === "admin"
                      ? "Admin"
                      : c.deleted_by_staff_user_id != null
                        ? staffUsers.find((s) => s.id === c.deleted_by_staff_user_id)?.display_name ||
                          staffUsers.find((s) => s.id === c.deleted_by_staff_user_id)?.username ||
                          `Staff #${c.deleted_by_staff_user_id}`
                        : "Unknown"}
                  </td>
                )}
                {!showDeleted && role === "admin" && (
                  <td className="px-3 py-1.5 text-[var(--color-text)] text-xs">
                    {c.visibility_scope === "everyone"
                      ? "Everyone"
                      : c.visibility_scope === "admin_only"
                        ? "Admin only"
                        : `Only ${
                            staffUsers.find((s) => s.id === c.visible_to_staff_user_id)?.display_name ||
                            staffUsers.find((s) => s.id === c.visible_to_staff_user_id)?.username ||
                            `#${c.visible_to_staff_user_id ?? "?"}`
                          }`}
                  </td>
                )}
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  {!showDeleted && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(c)}
                        className="px-2 py-1 rounded text-[var(--color-accent)] hover:bg-[var(--color-bg-card)] text-xs"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        className="px-2 py-1 rounded text-red-400/80 hover:bg-red-500/20 text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!showDeleted && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-text)]">
          <div className="text-[var(--color-accent)]">
            {totalCount === 0
              ? "Няма резултати."
              : `Показани ${rangeFrom}–${rangeTo} от ${totalCount} · страница ${pageIndex + 1} / ${totalPages}`}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pageIndex <= 0}
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-card)] text-xs font-medium disabled:opacity-40 hover:bg-[var(--color-bg-card)]/80"
            >
              Предишна
            </button>
            <button
              type="button"
              disabled={pageIndex >= totalPages - 1}
              onClick={() => setPageIndex((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-card)] text-xs font-medium disabled:opacity-40 hover:bg-[var(--color-bg-card)]/80"
            >
              Следваща
            </button>
          </div>
        </div>
      )}

      {pendingDeleteId != null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-xl bg-[var(--color-bg-secondary)] border border-[var(--color-bg-card)] p-4 space-y-3">
            <h3 className="text-sm font-medium text-[var(--color-text-bright)]">Delete client?</h3>
            <p className="text-xs text-[var(--color-accent)]">
              Клиентът ще бъде преместен в "Deleted clients".
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteId(null)}
                className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteClient}
                className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30"
              >
                Confirm delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
