import { useState, useEffect } from "react";
import { formatDateTime } from "../../lib/format";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  getCompetitors,
  searchCompetitors,
  getCompetitor,
  getCompetitorProducts,
  createCompetitor,
  createCompetitorsBulk,
  updateCompetitor,
  deleteCompetitor,
  addCompetitorProduct,
  addCompetitorProductsBulk,
  updateCompetitorProduct,
  deleteCompetitorProduct,
  type Competitor,
  type CompetitorProduct,
} from "../../lib/db";
import { useTableSelection } from "../../hooks/useTableSelection";
import { useNav } from "../../lib/navHistory";

interface CompetitionViewProps {
  initialSelectedId?: number;
  onNavigated?: () => void;
}

export function CompetitionView({ initialSelectedId, onNavigated }: CompetitionViewProps) {
  const nav = useNav();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [selected, setSelected] = useState<Competitor | null>(null);
  const [products, setProducts] = useState<CompetitorProduct[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Competitor | null>(null);
  const [editingProduct, setEditingProduct] = useState<CompetitorProduct | null>(null);
  const [formData, setFormData] = useState<Partial<Competitor>>({});
  const [productForm, setProductForm] = useState<Partial<CompetitorProduct>>({});

  const [search, setSearch] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [showImportProducts, setShowImportProducts] = useState(false);
  const [importProductsText, setImportProductsText] = useState("");

  const loadCompetitors = async () => {
    const list = search.trim() ? await searchCompetitors(search) : await getCompetitors();
    setCompetitors(list);
  };

  useEffect(() => {
    loadCompetitors();
  }, [search]);

  useEffect(() => {
    if (initialSelectedId) {
      getCompetitor(initialSelectedId).then((c) => {
        if (c) setSelected(c);
        onNavigated?.();
      });
    }
  }, [initialSelectedId]);

  useEffect(() => {
    if (selected) {
      getCompetitorProducts(selected.id).then(setProducts);
    } else {
      setProducts([]);
    }
  }, [selected]);

  const handleCreate = async () => {
    if (!formData.name) return;
    await createCompetitor(formData as Omit<Competitor, "id" | "created_at" | "updated_at">);
    setShowForm(false);
    setFormData({});
    loadCompetitors();
  };

  const handleUpdate = async () => {
    if (!editing) return;
    await updateCompetitor(editing.id, formData);
    setEditing(null);
    if (selected?.id === editing.id) setSelected({ ...selected, ...formData });
    setFormData({});
    loadCompetitors();
  };

  const handleDelete = async (id: number) => {
    if (confirm("Delete this competitor?")) {
      await deleteCompetitor(id);
      if (selected?.id === id) setSelected(null);
      loadCompetitors();
    }
  };

  const handleAddProduct = async () => {
    if (!selected || !productForm.name) return;
    await addCompetitorProduct(selected.id, productForm as Omit<CompetitorProduct, "id" | "competitor_id" | "created_at">);
    setProductForm({});
    setProducts(await getCompetitorProducts(selected.id));
  };

  const handleUpdateProduct = async () => {
    if (!editingProduct) return;
    await updateCompetitorProduct(editingProduct.id, productForm);
    setEditingProduct(null);
    setProductForm({});
    if (selected) setProducts(await getCompetitorProducts(selected.id));
  };

  const handleDeleteProduct = async (id: number) => {
    if (confirm("Delete this product?")) {
      await deleteCompetitorProduct(id);
      if (selected) setProducts(await getCompetitorProducts(selected.id));
    }
  };

  const handleOpenLink = (url: string) => {
    import("@tauri-apps/plugin-opener").then((mod) => mod.openUrl(url));
  };

  const competitorSelection = useTableSelection<Competitor>();
  const productSelection = useTableSelection<CompetitorProduct>();

  const handleBulkDeleteCompetitors = async () => {
    const ids = competitorSelection.getSelectedIds();
    if (ids.length === 0 || !confirm(`Delete ${ids.length} selected competitor(s)?`)) return;
    for (const id of ids) {
      await deleteCompetitor(id);
      if (selected?.id === id) setSelected(null);
    }
    competitorSelection.clearAll();
    loadCompetitors();
  };

  const handleBulkDeleteProducts = async () => {
    const ids = productSelection.getSelectedIds();
    if (ids.length === 0 || !confirm(`Delete ${ids.length} selected product(s)?`)) return;
    for (const id of ids) {
      await deleteCompetitorProduct(id);
    }
    productSelection.clearAll();
    if (selected) setProducts(await getCompetitorProducts(selected.id));
  };

  const parseImportCompetitors = (text: string): Omit<Competitor, "id" | "created_at" | "updated_at">[] => {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return [];
    const rows = lines.map((l) => l.split(/\t/).map((c) => c.trim()));
    const isHeader =
      rows[0]?.length &&
      /^(name|име|website|сайт|contacts|контакти|address|адрес)/i.test(String(rows[0][0] ?? ""));
    const dataRows = isHeader ? rows.slice(1) : rows;
    const cols = ["name", "website", "contacts", "address", "notes"] as const;
    return dataRows
      .filter((r) => r[0])
      .map((r) => {
        const o: Record<string, string | null> = {};
        cols.forEach((k, i) => {
          o[k] = r[i] || null;
        });
        return o as Omit<Competitor, "id" | "created_at" | "updated_at">;
      });
  };

  const handleImportCompetitors = async () => {
    const items = parseImportCompetitors(importText);
    if (items.length === 0) {
      alert("No valid rows. Paste tab-separated data. Columns: Name, Website, Contacts, Address, Notes. First row can be headers.");
      return;
    }
    const n = await createCompetitorsBulk(items);
    setShowImport(false);
    setImportText("");
    loadCompetitors();
    alert(`Imported ${n} competitor(s).`);
  };

  const parseImportProducts = (text: string): Omit<CompetitorProduct, "id" | "competitor_id" | "created_at">[] => {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return [];
    const rows = lines.map((l) => l.split(/\t/).map((c) => c.trim()));
    const isHeader =
      rows[0]?.length &&
      /^(name|име|brand|марка|model|модел|price|цена)/i.test(String(rows[0][0] ?? ""));
    const dataRows = isHeader ? rows.slice(1) : rows;
    const cols = ["name", "brand", "model", "parameters", "price", "link", "photo_path"] as const;
    return dataRows
      .filter((r) => r[0])
      .map((r) => {
        const o: Record<string, string | null> = {};
        cols.forEach((k, i) => {
          o[k] = r[i] || null;
        });
        return o as Omit<CompetitorProduct, "id" | "competitor_id" | "created_at">;
      });
  };

  const handleImportProducts = async () => {
    if (!selected) return;
    const items = parseImportProducts(importProductsText);
    if (items.length === 0) {
      alert("No valid rows. Paste tab-separated data (e.g. from Excel). Columns: Name, Brand, Model, Parameters, Price, Link, Photo path.");
      return;
    }
    const n = await addCompetitorProductsBulk(selected.id, items);
    setShowImportProducts(false);
    setImportProductsText("");
    setProducts(await getCompetitorProducts(selected.id));
    alert(`Imported ${n} product(s).`);
  };

  if (selected && !editing && !showForm) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              if (!nav.back()) {
                setSelected(null);
                onNavigated?.();
              }
            }}
            className="text-[var(--color-accent)] hover:text-[var(--color-text)] text-sm"
          >
            ← Back
          </button>
          <h2 className="text-lg font-medium text-[var(--color-text-bright)]">{selected.name}</h2>
          <button
            onClick={() => { setEditing(selected); setFormData(selected); }}
            className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-card)] text-sm text-[var(--color-text)]"
          >
            Edit
          </button>
        </div>
          <div className="grid grid-cols-2 gap-4 text-sm max-w-2xl">
          <div><span className="text-[var(--color-accent)]">Website:</span>{" "}
            {selected.website ? (
              <a href={selected.website} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">{selected.website}</a>
            ) : "—"}
          </div>
          <div className="col-span-2"><span className="text-[var(--color-accent)]">Address:</span> {selected.address || "—"}</div>
          <div className="col-span-2"><span className="text-[var(--color-accent)]">Contacts:</span> {selected.contacts || "—"}</div>
          <div className="col-span-2"><span className="text-[var(--color-accent)]">Notes:</span> {selected.notes || "—"}</div>
        </div>
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[var(--color-text-bright)]">Products</h3>
            <button
              onClick={() => setShowImportProducts(true)}
              className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-xs font-medium hover:bg-[var(--color-bg-card)]/80"
            >
              Import
            </button>
          </div>
          {showImportProducts && (
            <div className="p-4 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-bg-card)] mb-4">
              <h4 className="text-xs font-medium text-[var(--color-text-bright)] mb-2">Import products (paste from Excel)</h4>
              <p className="text-xs text-[var(--color-accent)]/80 mb-2">
                Columns: Name, Brand, Model, Parameters, Price, Link, Photo path. First row can be headers.
              </p>
              <textarea
                value={importProductsText}
                onChange={(e) => setImportProductsText(e.target.value)}
                placeholder="Paste your data here..."
                rows={6}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm font-mono mb-2"
              />
              <div className="flex gap-2">
                <button onClick={handleImportProducts} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm">Import</button>
                <button onClick={() => { setShowImportProducts(false); setImportProductsText(""); }} className="px-4 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm">Cancel</button>
              </div>
            </div>
          )}
          {(editingProduct ? (
            <div className="p-4 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-bg-card)] mb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Name"
                  value={productForm.name ?? ""}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
                />
                <input
                  placeholder="Brand"
                  value={productForm.brand ?? ""}
                  onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
                />
                <input
                  placeholder="Model"
                  value={productForm.model ?? ""}
                  onChange={(e) => setProductForm({ ...productForm, model: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
                />
                <input
                  placeholder="Price"
                  value={productForm.price ?? ""}
                  onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
                />
                <input
                  placeholder="Link"
                  value={productForm.link ?? ""}
                  onChange={(e) => setProductForm({ ...productForm, link: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm col-span-2"
                />
                <input
                  placeholder="Parameters"
                  value={productForm.parameters ?? ""}
                  onChange={(e) => setProductForm({ ...productForm, parameters: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm col-span-2"
                />
                <div className="col-span-2">
                  <label className="block text-xs text-[var(--color-accent)] mb-1">Photo path (local file)</label>
                  <input
                    type="text"
                    placeholder="C:\path\to\image.png"
                    value={productForm.photo_path ?? ""}
                    onChange={(e) => setProductForm({ ...productForm, photo_path: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleUpdateProduct}
                  className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm"
                >
                  Update
                </button>
                <button
                  onClick={() => { setEditingProduct(null); setProductForm({}); }}
                  className="px-4 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-bg-card)] mb-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="Name"
                  value={productForm.name ?? ""}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
                />
                <input
                  placeholder="Brand"
                  value={productForm.brand ?? ""}
                  onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
                />
                <input
                  placeholder="Model"
                  value={productForm.model ?? ""}
                  onChange={(e) => setProductForm({ ...productForm, model: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
                />
                <input
                  placeholder="Price"
                  value={productForm.price ?? ""}
                  onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
                />
                <input
                  placeholder="Link"
                  value={productForm.link ?? ""}
                  onChange={(e) => setProductForm({ ...productForm, link: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm col-span-2"
                />
                <div className="col-span-2">
                  <label className="block text-xs text-[var(--color-accent)] mb-1">Photo path (local file)</label>
                  <input
                    type="text"
                    placeholder="C:\path\to\image.png"
                    value={productForm.photo_path ?? ""}
                    onChange={(e) => setProductForm({ ...productForm, photo_path: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
                  />
                </div>
              </div>
              <button
                onClick={handleAddProduct}
                disabled={!productForm.name}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm"
              >
                Add Product
              </button>
            </div>
          ))}
          {productSelection.selectedIds.size > 0 && (
            <div className="flex items-center gap-4 px-4 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-bg-card)] mb-4">
              <span className="text-sm text-[var(--color-accent)]">{productSelection.selectedIds.size} selected</span>
              <button onClick={handleBulkDeleteProducts} className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30">Delete selected</button>
              <button onClick={productSelection.clearAll} className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-xs">Clear selection</button>
            </div>
          )}
          <div className="rounded-lg border border-[var(--color-bg-card)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-bg-secondary)] text-[var(--color-accent)] text-left">
                  <th className="px-3 py-1.5 w-10" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={products.length > 0 && products.every((p) => productSelection.isSelected(p.id))} onChange={() => productSelection.toggleAll(products)} className="rounded border-[var(--color-bg-card)]" />
                  </th>
                  <th className="px-3 py-1.5 font-medium">Name</th>
                  <th className="px-3 py-1.5 font-medium">Brand</th>
                  <th className="px-3 py-1.5 font-medium">Model</th>
                  <th className="px-3 py-1.5 font-medium">Price</th>
                  <th className="px-3 py-1.5 font-medium">Photo</th>
                  <th className="px-3 py-1.5 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p, idx) => (
                  <tr key={p.id} className="border-t border-[var(--color-bg-card)]">
                    <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={productSelection.isSelected(p.id)} onChange={() => {}} onClick={(e) => { e.stopPropagation(); productSelection.toggle(p.id, idx, products, e.shiftKey); }} className="rounded border-[var(--color-bg-card)]" />
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="text-[10px] text-[var(--color-accent)]/60">{formatDateTime(p.created_at)}</div>
                      <div className="text-[var(--color-text-bright)]">{p.name}</div>
                    </td>
                    <td className="px-3 py-1.5 text-[var(--color-text)]">{p.brand || "—"}</td>
                    <td className="px-3 py-1.5 text-[var(--color-text)]">{p.model || "—"}</td>
                    <td className="px-3 py-1.5 text-[var(--color-text)]">{p.price || "—"}</td>
                    <td className="px-3 py-1.5">
                      {p.photo_path ? (
                        <img src={convertFileSrc(p.photo_path)} alt="" className="w-8 h-8 object-cover rounded" />
                      ) : "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1">
                        {p.link && (
                          <button
                            onClick={() => handleOpenLink(p.link!)}
                            className="px-2 py-1 rounded text-[var(--color-accent)] hover:bg-[var(--color-bg-card)] text-xs"
                          >
                            Link
                          </button>
                        )}
                        <button
                          onClick={() => { setEditingProduct(p); setProductForm(p); }}
                          className="px-2 py-1 rounded text-[var(--color-accent)] hover:bg-[var(--color-bg-card)] text-xs"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(p.id)}
                          className="px-2 py-1 rounded text-red-400/80 hover:bg-red-500/20 text-xs"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  const isFormOpen = showForm || editing;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-medium text-[var(--color-text-bright)]">Competition</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="px-4 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm font-medium hover:bg-[var(--color-bg-card)]/80 border border-[var(--color-bg-card)]"
          >
            Import
          </button>
          <input
            type="search"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-[var(--color-text)] placeholder:text-[var(--color-accent)]/60 focus:outline-none focus:border-[var(--color-accent)] w-48"
          />
          <button
            onClick={() => { setShowForm(true); setFormData({}); }}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium"
          >
            Add Competitor
          </button>
        </div>
      </div>

      {competitorSelection.selectedIds.size > 0 && (
        <div className="flex items-center gap-4 px-4 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-bg-card)]">
          <span className="text-sm text-[var(--color-accent)]">{competitorSelection.selectedIds.size} selected</span>
          <button onClick={handleBulkDeleteCompetitors} className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30">Delete selected</button>
          <button onClick={competitorSelection.clearAll} className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-xs">Clear selection</button>
        </div>
      )}

      {showImport && (
        <div className="p-4 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-bg-card)]">
          <h3 className="text-sm font-medium text-[var(--color-text-bright)] mb-2">Import competitors (paste from Excel)</h3>
          <p className="text-xs text-[var(--color-accent)]/80 mb-2">
            Paste tab-separated data. Columns: Name, Website, Contacts, Address, Notes. First row can be headers.
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste your data here..."
            rows={8}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] font-mono text-sm mb-2"
          />
          <div className="flex gap-2">
            <button onClick={handleImportCompetitors} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium">Import</button>
            <button onClick={() => { setShowImport(false); setImportText(""); }} className="px-4 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm">Cancel</button>
          </div>
        </div>
      )}

      {isFormOpen && (
        <div className="p-4 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-bg-card)] max-w-xl space-y-4">
          <h3 className="text-sm font-medium">{editing ? "Edit Competitor" : "Add Competitor"}</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-[var(--color-accent)] mb-1">Name *</label>
              <input
                type="text"
                value={formData.name ?? ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-accent)] mb-1">Website</label>
              <input
                type="url"
                value={formData.website ?? ""}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-accent)] mb-1">Address</label>
              <input
                type="text"
                value={formData.address ?? ""}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-accent)] mb-1">Contacts</label>
              <textarea
                value={formData.contacts ?? ""}
                onChange={(e) => setFormData({ ...formData, contacts: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-accent)] mb-1">Notes</label>
              <textarea
                value={formData.notes ?? ""}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)]"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={editing ? handleUpdate : handleCreate}
              disabled={!formData.name}
              className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium"
            >
              {editing ? "Update" : "Add"}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditing(null); setFormData({}); }}
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
              <th className="px-3 py-1.5 w-10" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={competitors.length > 0 && competitors.every((c) => competitorSelection.isSelected(c.id))} onChange={() => competitorSelection.toggleAll(competitors)} className="rounded border-[var(--color-bg-card)]" />
              </th>
              <th className="px-3 py-1.5 font-medium">Name</th>
              <th className="px-3 py-1.5 font-medium">Website</th>
              <th className="px-3 py-1.5 font-medium w-28">Address</th>
              <th className="px-3 py-1.5 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {competitors.map((c, idx) => (
              <tr
                key={c.id}
                className="border-t border-[var(--color-bg-card)] hover:bg-[var(--color-bg-card)]/30 cursor-pointer"
                onClick={() => {
                  nav.push({ restore: () => setSelected(null) });
                  setSelected(c);
                }}
              >
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={competitorSelection.isSelected(c.id)} onChange={() => {}} onClick={(e) => { e.stopPropagation(); competitorSelection.toggle(c.id, idx, competitors, e.shiftKey); }} className="rounded border-[var(--color-bg-card)]" />
                </td>
                <td className="px-3 py-1.5">
                  <div className="text-[10px] text-[var(--color-accent)]/60">{formatDateTime(c.updated_at || c.created_at)}</div>
                  <div className="text-[var(--color-text-bright)]">{c.name}</div>
                </td>
                <td className="px-3 py-1.5 text-[var(--color-text)]">{c.website || "—"}</td>
                <td className="px-3 py-1.5 text-[var(--color-text)]" title={c.address || undefined}>
                  {c.address ? (c.address.length > 10 ? `${c.address.slice(0, 10)}…` : c.address) : "—"}
                </td>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setEditing(c); setFormData(c); }}
                      className="px-2 py-1 rounded text-[var(--color-accent)] hover:bg-[var(--color-bg-card)] text-xs"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="px-2 py-1 rounded text-red-400/80 hover:bg-red-500/20 text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
