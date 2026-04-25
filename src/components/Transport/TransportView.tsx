import { useState, useEffect, useRef } from "react";
import { formatDateTime } from "../../lib/format";
import html2canvas from "html2canvas";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import {
  getTransportSuppliers,
  getTransportSupplier,
  getTransportSupplierHistory,
  createTransportSupplier,
  updateTransportSupplier,
  updateTransportSupplierPrices,
  clearAllTransportSupplierPrices,
  deleteTransportSupplier,
  addTransportSupplierHistory,
  type TransportSupplier,
  type TransportSupplierHistory,
} from "../../lib/db";
import { useTableSelection } from "../../hooks/useTableSelection";

const EUR_USD_API = "https://api.frankfurter.app/latest?from=EUR&to=USD";

function parsePriceInput(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = parseFloat(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

interface TransportViewProps {
  initialSelectedId?: number;
  onNavigated?: () => void;
}

interface QuoteRow {
  id: string;
  name: string;
  seaUsd: number;
  landEur: number;
  otherEur: number;
}

export function TransportView({ initialSelectedId, onNavigated }: TransportViewProps) {
  const [suppliers, setSuppliers] = useState<TransportSupplier[]>([]);
  const [selected, setSelected] = useState<TransportSupplier | null>(null);
  const [history, setHistory] = useState<TransportSupplierHistory[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TransportSupplier | null>(null);
  const [formData, setFormData] = useState<Partial<TransportSupplier>>({});
  const [usdRate, setUsdRate] = useState<number | null>(null);
  const [usdRateFetchDone, setUsdRateFetchDone] = useState(false);
  const [manualRate, setManualRate] = useState("");
  const [showCompare, setShowCompare] = useState(false);
  const [quoteRows, setQuoteRows] = useState<QuoteRow[]>([]);
  const [histDate, setHistDate] = useState(new Date().toISOString().slice(0, 10));
  const [histDesc, setHistDesc] = useState("");
  const [histNotes, setHistNotes] = useState("");
  const [addQuoteName, setAddQuoteName] = useState("");
  const exportRef = useRef<HTMLDivElement>(null);
  const suppliersRef = useRef<TransportSupplier[]>([]);
  const priceSaveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  suppliersRef.current = suppliers;

  const manualParsed = manualRate.trim() !== "" ? parseFloat(manualRate.replace(",", ".")) : null;
  const rate =
    usdRate != null && Number.isFinite(usdRate) && usdRate > 0
      ? usdRate
      : manualParsed != null && Number.isFinite(manualParsed) && manualParsed > 0
        ? manualParsed
        : null;

  const loadSuppliers = async () => {
    setSuppliers(await getTransportSuppliers());
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  useEffect(() => {
    return () => {
      for (const t of Object.values(priceSaveTimers.current)) clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let got = false;
      try {
        const n = await invoke<number | null>("fetch_frankfurter_eur_usd");
        if (!cancelled && n != null && Number.isFinite(n) && n > 0) {
          setUsdRate(n);
          got = true;
        }
      } catch {
        /* не-Tauri dev или грешка */
      }
      if (!got && !cancelled) {
        try {
          const r = await fetch(EUR_USD_API);
          const d = (await r.json()) as { rates?: { USD?: number } };
          if (!cancelled && d.rates?.USD != null && d.rates.USD > 0) setUsdRate(d.rates.USD);
        } catch {
          /* мрежа / CORS в браузър */
        }
      }
      if (!cancelled) setUsdRateFetchDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selected) {
      getTransportSupplierHistory(selected.id).then(setHistory);
    } else {
      setHistory([]);
    }
  }, [selected]);

  useEffect(() => {
    if (initialSelectedId) {
      getTransportSupplier(initialSelectedId).then((s) => {
        if (s) setSelected(s);
        onNavigated?.();
      });
    }
  }, [initialSelectedId]);

  const calcTotalEur = (row: { seaUsd: number; landEur: number; otherEur: number }) => {
    const seaEur = rate ? row.seaUsd / rate : 0;
    return seaEur + row.landEur + row.otherEur;
  };

  const handleCreate = async () => {
    if (!formData.company_name) return;
    await createTransportSupplier(formData as Omit<TransportSupplier, "id" | "created_at" | "updated_at">);
    setShowForm(false);
    setFormData({});
    loadSuppliers();
  };

  const handleUpdate = async () => {
    if (!editing) return;
    await updateTransportSupplier(editing.id, formData);
    setEditing(null);
    if (selected?.id === editing.id) setSelected({ ...selected, ...formData });
    setFormData({});
    loadSuppliers();
  };

  const handleAddHistory = async () => {
    if (!selected) return;
    await addTransportSupplierHistory(selected.id, histDate, histDesc, histNotes);
    setHistDesc("");
    setHistNotes("");
    setHistory(await getTransportSupplierHistory(selected.id));
  };

  const transportSelection = useTableSelection<TransportSupplier>();

  const handleBulkDeleteTransport = async () => {
    const ids = transportSelection.getSelectedIds();
    if (ids.length === 0 || !confirm(`Delete ${ids.length} selected transport supplier(s)?`)) return;
    for (const id of ids) {
      await deleteTransportSupplier(id);
      if (selected?.id === id) setSelected(null);
    }
    transportSelection.clearAll();
    loadSuppliers();
  };

  const handleClearAllPrices = async () => {
    if (suppliers.length === 0) return;
    if (
      !confirm(
        "Да се изчистят ли всички въведени транспортни цени (Sea USD, Land EUR, Other EUR) за всички доставчици? Компаниите остават; нулират се само полетата с цени."
      )
    ) {
      return;
    }
    try {
      await clearAllTransportSupplierPrices();
      await loadSuppliers();
    } catch (e) {
      alert(String(e));
    }
  };

  const persistTransportPrices = (id: number) => {
    const row = suppliersRef.current.find((r) => r.id === id);
    if (!row) return;
    void updateTransportSupplierPrices(id, {
      sea_freight_usd: row.sea_freight_usd,
      land_transport_eur: row.land_transport_eur,
      other_eur: row.other_eur,
    }).catch(() => {});
  };

  const schedulePriceSave = (id: number) => {
    const prev = priceSaveTimers.current[id];
    if (prev) clearTimeout(prev);
    priceSaveTimers.current[id] = setTimeout(() => {
      delete priceSaveTimers.current[id];
      persistTransportPrices(id);
    }, 450);
  };

  const flushPriceSave = (id: number) => {
    const prev = priceSaveTimers.current[id];
    if (prev) {
      clearTimeout(prev);
      delete priceSaveTimers.current[id];
    }
    persistTransportPrices(id);
  };

  const updateSupplierPriceField = (
    id: number,
    field: "sea_freight_usd" | "land_transport_eur" | "other_eur",
    raw: string
  ) => {
    const num = parsePriceInput(raw);
    setSuppliers((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: num } : s)));
    schedulePriceSave(id);
  };

  const handleExportScreenshot = async () => {
    if (!exportRef.current) return;
    try {
      const path = await save({
        defaultPath: `rxg_call_hub_transport_${Date.now()}.png`,
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!path) return;
      const canvas = await html2canvas(exportRef.current, { backgroundColor: "#0f172a" });
      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];
      if (!base64) throw new Error("Failed to encode");
      await invoke("save_screenshot", { data: base64, path });
      alert(`Saved to ${path}`);
    } catch (e) {
      alert(`Export failed: ${e}`);
    }
  };

  if (showCompare) {
    const updateQuoteRow = (id: string, upd: Partial<QuoteRow>) => {
      setQuoteRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...upd } : r)));
    };
    const rowsWithTotal = quoteRows.map((r) => ({ ...r, totalEur: calcTotalEur(r) }));
    const withTotal = rowsWithTotal.filter((r) => r.totalEur > 0);
    const best = withTotal.length ? withTotal.reduce((a, b) => (a.totalEur < b.totalEur ? a : b)) : null;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setShowCompare(false)} className="text-[var(--color-accent)] hover:text-[var(--color-text)] text-sm">
            ← Back
          </button>
          <button
            onClick={handleExportScreenshot}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium"
          >
            Export Screenshot
          </button>
        </div>
        <div ref={exportRef} className="p-4 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-bg-card)]">
          <div className="flex items-center gap-4 mb-4">
            <span className="text-sm text-[var(--color-accent)]">EUR/USD rate:</span>
            <input
              type="number"
              step="0.0001"
              value={manualRate !== "" ? manualRate : usdRate != null ? String(usdRate) : ""}
              onChange={(e) => setManualRate(e.target.value)}
              placeholder="Auto"
              className="w-24 px-2 py-1 rounded bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
            />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--color-accent)] text-left">
                <th className="px-4 py-2">Supplier</th>
                <th className="px-4 py-2">Sea (USD)</th>
                <th className="px-4 py-2">Land (EUR)</th>
                <th className="px-4 py-2">Other (EUR)</th>
                <th className="px-4 py-2">Total EUR</th>
                <th className="px-4 py-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {rowsWithTotal.map((r) => (
                <tr key={r.id} className={`border-t border-[var(--color-bg-card)] ${best && r.id === best.id ? "bg-[var(--color-bg-card)]/50" : ""}`}>
                  <td className="px-4 py-2 text-[var(--color-text-bright)]">{r.name}</td>
                  <td className="px-4 py-2">
                    <input type="number" step="0.01" value={r.seaUsd || ""} onChange={(e) => updateQuoteRow(r.id, { seaUsd: parseFloat(e.target.value) || 0 })} className="w-20 px-2 py-1 rounded bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" step="0.01" value={r.landEur || ""} onChange={(e) => updateQuoteRow(r.id, { landEur: parseFloat(e.target.value) || 0 })} className="w-20 px-2 py-1 rounded bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" step="0.01" value={r.otherEur || ""} onChange={(e) => updateQuoteRow(r.id, { otherEur: parseFloat(e.target.value) || 0 })} className="w-20 px-2 py-1 rounded bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm" />
                  </td>
                  <td className="px-4 py-2 font-medium">{r.totalEur.toFixed(2)}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => setQuoteRows((p) => p.filter((x) => x.id !== r.id))} className="text-red-400/80 text-xs">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex gap-2">
            <input
              placeholder="Supplier name"
              value={addQuoteName}
              onChange={(e) => setAddQuoteName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && addQuoteName.trim()) {
                  setQuoteRows((p) => [...p, { id: crypto.randomUUID(), name: addQuoteName.trim(), seaUsd: 0, landEur: 0, otherEur: 0 }]);
                  setAddQuoteName("");
                }
              }}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm flex-1"
            />
            <button
              onClick={() => {
                if (addQuoteName.trim()) {
                  setQuoteRows((p) => [...p, { id: crypto.randomUUID(), name: addQuoteName.trim(), seaUsd: 0, landEur: 0, otherEur: 0 }]);
                  setAddQuoteName("");
                }
              }}
              className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (selected && !editing && !showForm) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <button onClick={() => { setSelected(null); onNavigated?.(); }} className="text-[var(--color-accent)] hover:text-[var(--color-text)] text-sm">
            ← Back
          </button>
          <h2 className="text-lg font-medium text-[var(--color-text-bright)]">{selected.company_name}</h2>
          <button onClick={() => { setEditing(selected); setFormData(selected); }} className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-card)] text-sm text-[var(--color-text)]">
            Edit
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm max-w-2xl">
          <div><span className="text-[var(--color-accent)]">Phone:</span> {selected.phone || "—"}</div>
          <div><span className="text-[var(--color-accent)]">Email:</span> {selected.email ? <a href={`mailto:${selected.email}`} className="text-[var(--color-accent)] hover:underline">{selected.email}</a> : "—"}</div>
          <div><span className="text-[var(--color-accent)]">Contact:</span> {selected.contact_person || "—"}</div>
          <div className="col-span-2"><span className="text-[var(--color-accent)]">Notes:</span> {selected.notes || "—"}</div>
          <div className="col-span-2"><span className="text-[var(--color-accent)]">Comment:</span> {selected.comment || "—"}</div>
        </div>
        <div className="mt-4">
          <h3 className="text-sm font-medium text-[var(--color-text-bright)] mb-2">Transport history</h3>
          <div className="flex gap-2 mb-2">
            <input type="date" value={histDate} onChange={(e) => setHistDate(e.target.value)} className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm" />
            <input placeholder="Description" value={histDesc} onChange={(e) => setHistDesc(e.target.value)} className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm flex-1" />
            <input placeholder="Notes" value={histNotes} onChange={(e) => setHistNotes(e.target.value)} className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm flex-1" />
            <button onClick={handleAddHistory} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm">Add</button>
          </div>
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="p-3 rounded-lg bg-[var(--color-bg-card)] text-sm">
                <div className="text-[10px] text-[var(--color-accent)]/60">{formatDateTime(h.created_at)}</div>
                <span className="text-[var(--color-accent)]">{h.date}</span> {h.description && `— ${h.description}`}
                {h.notes && <div className="text-[var(--color-accent)]/80 mt-1">{h.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const isFormOpen = showForm || editing;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-medium text-[var(--color-text-bright)]">Transport Suppliers</h1>
          <button
            type="button"
            onClick={handleClearAllPrices}
            disabled={suppliers.length === 0}
            title="Нулира Sea / Land / Other за всички редове в таблицата"
            className="px-3 py-1.5 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-bg-card)] text-[var(--color-text)] text-xs font-medium hover:bg-[var(--color-accent)]/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Изчисти цените
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCompare(true)} className="px-4 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm hover:bg-[var(--color-bg-card)]/80">
            Compare Quotes
          </button>
          <button onClick={() => { setShowForm(true); setFormData({}); }} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium">
            Add Transport Supplier
          </button>
        </div>
      </div>

      {transportSelection.selectedIds.size > 0 && (
        <div className="flex items-center gap-4 px-4 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-bg-card)]">
          <span className="text-sm text-[var(--color-accent)]">{transportSelection.selectedIds.size} selected</span>
          <button onClick={handleBulkDeleteTransport} className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30">Delete selected</button>
          <button onClick={transportSelection.clearAll} className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-xs">Clear selection</button>
        </div>
      )}

      {isFormOpen && (
        <div className="p-4 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-bg-card)] max-w-xl space-y-4">
          <h3 className="text-sm font-medium">{editing ? "Edit" : "Add"} Transport Supplier</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-[var(--color-accent)] mb-1">Company name *</label>
              <input value={formData.company_name ?? ""} onChange={(e) => setFormData({ ...formData, company_name: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Phone</label>
                <input value={formData.phone ?? ""} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)]" />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Email</label>
                <input type="email" value={formData.email ?? ""} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)]" />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-accent)] mb-1">Contact person</label>
                <input value={formData.contact_person ?? ""} onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)]" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-accent)] mb-1">Notes</label>
              <textarea value={formData.notes ?? ""} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)]" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-accent)] mb-1">Comment</label>
              <textarea value={formData.comment ?? ""} onChange={(e) => setFormData({ ...formData, comment: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)]" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={editing ? handleUpdate : handleCreate} disabled={!formData.company_name} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium">
              {editing ? "Update" : "Add"}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null); setFormData({}); }} className="px-4 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[var(--color-bg-card)] overflow-hidden">
        <div className="px-4 py-2 bg-[var(--color-bg-secondary)] border-b border-[var(--color-bg-card)] flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-accent)]">EUR/USD:</span>
            <input
              type="number"
              step="0.0001"
              value={manualRate !== "" ? manualRate : usdRate != null ? String(usdRate) : ""}
              onChange={(e) => setManualRate(e.target.value)}
              placeholder="Auto"
              title="Курс: колко USD за 1 EUR. Нужен за Sea (USD) → Total EUR."
              className="w-24 px-2 py-1 rounded bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
            />
          </div>
          {rate == null && usdRateFetchDone && (
            <span className="text-[10px] text-amber-400/90 max-w-md">
              Няма курс — въведете число тук за да се смята Sea (USD) в Total EUR.
            </span>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--color-bg-secondary)] text-[var(--color-accent)] text-left">
              <th className="px-3 py-1.5 w-10" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={suppliers.length > 0 && suppliers.every((s) => transportSelection.isSelected(s.id))} onChange={() => transportSelection.toggleAll(suppliers)} className="rounded border-[var(--color-bg-card)]" />
              </th>
              <th className="px-3 py-1.5 font-medium">Company</th>
              <th className="px-3 py-1.5 font-medium">Sea (USD)</th>
              <th className="px-3 py-1.5 font-medium">Land (EUR)</th>
              <th className="px-3 py-1.5 font-medium">Other (EUR)</th>
              <th className="px-3 py-1.5 font-medium">Total EUR</th>
              <th className="px-3 py-1.5 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s, idx) => {
              const seaEur = rate && s.sea_freight_usd ? s.sea_freight_usd / rate : 0;
              const landEur = s.land_transport_eur ?? 0;
              const otherEur = s.other_eur ?? 0;
              const total = seaEur + landEur + otherEur;
              return (
                <tr key={s.id} className="border-t border-[var(--color-bg-card)] hover:bg-[var(--color-bg-card)]/30 cursor-pointer" onClick={() => setSelected(s)}>
                  <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={transportSelection.isSelected(s.id)} onChange={() => {}} onClick={(e) => { e.stopPropagation(); transportSelection.toggle(s.id, idx, suppliers, e.shiftKey); }} className="rounded border-[var(--color-bg-card)]" />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="text-[10px] text-[var(--color-accent)]/60">{formatDateTime(s.updated_at || s.created_at)}</div>
                    <div className="text-[var(--color-text-bright)]">{s.company_name}</div>
                  </td>
                  <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="number"
                      step="0.01"
                      value={s.sea_freight_usd ?? ""}
                      onChange={(e) => updateSupplierPriceField(s.id, "sea_freight_usd", e.target.value)}
                      onBlur={() => flushPriceSave(s.id)}
                      className="w-20 px-2 py-1 rounded bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
                    />
                  </td>
                  <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="number"
                      step="0.01"
                      value={s.land_transport_eur ?? ""}
                      onChange={(e) => updateSupplierPriceField(s.id, "land_transport_eur", e.target.value)}
                      onBlur={() => flushPriceSave(s.id)}
                      className="w-20 px-2 py-1 rounded bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
                    />
                  </td>
                  <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="number"
                      step="0.01"
                      value={s.other_eur ?? ""}
                      onChange={(e) => updateSupplierPriceField(s.id, "other_eur", e.target.value)}
                      onBlur={() => flushPriceSave(s.id)}
                      className="w-20 px-2 py-1 rounded bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
                    />
                  </td>
                  <td
                    className="px-3 py-1.5 text-[var(--color-text-bright)] font-medium"
                    title={
                      (s.sea_freight_usd ?? 0) > 0 && !rate
                        ? "За превалутиране на Sea (USD) е нужен валиден EUR/USD курс (полето горе)."
                        : undefined
                    }
                  >
                    {total > 0 ? total.toFixed(2) : "—"}
                  </td>
                  <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditing(s); setFormData(s); }} className="px-2 py-1 rounded text-[var(--color-accent)] hover:bg-[var(--color-bg-card)] text-xs">Edit</button>
                      <button onClick={async () => { if (confirm("Delete?")) { await deleteTransportSupplier(s.id); if (selected?.id === s.id) setSelected(null); loadSuppliers(); } }} className="px-2 py-1 rounded text-red-400/80 hover:bg-red-500/20 text-xs">Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
