import { useState, useEffect } from "react";
import { formatDateTime } from "../../lib/format";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  getSuppliers,
  searchSuppliers,
  getSupplier,
  createSupplier,
  createSuppliersBulk,
  updateSupplier,
  deleteSupplier,
  getSupplierOrders,
  addSupplierOrder,
  getSupplierProducts,
  addSupplierProduct,
  addSupplierProductsBulk,
  updateSupplierProduct,
  deleteSupplierProduct,
  type Supplier,
  type SupplierOrder,
  type SupplierProduct,
} from "../../lib/db";
import { useTableSelection } from "../../hooks/useTableSelection";
import { useNav } from "../../lib/navHistory";

interface SuppliersViewProps {
  initialSelectedId?: number;
  onNavigated?: () => void;
}

export function SuppliersView({ initialSelectedId, onNavigated }: SuppliersViewProps) {
  const nav = useNav();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [orderDesc, setOrderDesc] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [editingProduct, setEditingProduct] = useState<SupplierProduct | null>(null);
  const [productForm, setProductForm] = useState<Partial<SupplierProduct>>({});
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [showImportProducts, setShowImportProducts] = useState(false);
  const [importProductsText, setImportProductsText] = useState("");

  const [search, setSearch] = useState("");
  const [expandedTechInfoIds, setExpandedTechInfoIds] = useState<Set<number>>(new Set());

  const toggleTechInfo = (id: number) => {
    setExpandedTechInfoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadSuppliers = async () => {
    const list = search.trim() ? await searchSuppliers(search) : await getSuppliers();
    setSuppliers(list);
  };

  useEffect(() => {
    loadSuppliers();
  }, [search]);

  useEffect(() => {
    if (initialSelectedId) {
      getSupplier(initialSelectedId).then((s) => {
        if (s) setSelected(s);
        onNavigated?.();
      });
    }
  }, [initialSelectedId]);

  useEffect(() => {
    if (selected) {
      getSupplierOrders(selected.id).then(setOrders);
      getSupplierProducts(selected.id).then(setProducts);
    } else {
      setOrders([]);
      setProducts([]);
    }
  }, [selected]);

  const [formData, setFormData] = useState<Partial<Supplier>>({});

  const handleCreate = async () => {
    if (!formData.name) return;
    await createSupplier(formData as Omit<Supplier, "id" | "created_at" | "updated_at">);
    setShowForm(false);
    setFormData({});
    loadSuppliers();
  };

  const handleUpdate = async () => {
    if (!editing) return;
    await updateSupplier(editing.id, formData);
    setEditing(null);
    if (selected?.id === editing.id) setSelected({ ...selected, ...formData });
    setFormData({});
    loadSuppliers();
  };

  const handleDelete = async (id: number) => {
    if (confirm("Delete this supplier?")) {
      await deleteSupplier(id);
      if (selected?.id === id) setSelected(null);
      loadSuppliers();
    }
  };

  const supplierSelection = useTableSelection<Supplier>();
  const productSelection = useTableSelection<SupplierProduct>();

  const handleBulkDeleteSuppliers = async () => {
    const ids = supplierSelection.getSelectedIds();
    if (ids.length === 0 || !confirm(`Delete ${ids.length} selected supplier(s)?`)) return;
    for (const id of ids) {
      await deleteSupplier(id);
      if (selected?.id === id) setSelected(null);
    }
    supplierSelection.clearAll();
    loadSuppliers();
  };

  const handleBulkDeleteProducts = async () => {
    const ids = productSelection.getSelectedIds();
    if (ids.length === 0 || !confirm(`Delete ${ids.length} selected product(s)?`)) return;
    for (const id of ids) {
      await deleteSupplierProduct(id);
    }
    productSelection.clearAll();
    if (selected) setProducts(await getSupplierProducts(selected.id));
  };

  const handleAddOrder = async () => {
    if (!selected) return;
    await addSupplierOrder(selected.id, orderDate, orderDesc, orderNotes);
    setOrderDesc("");
    setOrderNotes("");
    setOrders(await getSupplierOrders(selected.id));
  };

  const handleAddProduct = async () => {
    if (!selected || !productForm.name) return;
    await addSupplierProduct(selected.id, productForm as Omit<SupplierProduct, "id" | "supplier_id" | "created_at">);
    setProductForm({});
    setProducts(await getSupplierProducts(selected.id));
  };

  const handleUpdateProduct = async () => {
    if (!editingProduct) return;
    await updateSupplierProduct(editingProduct.id, productForm);
    setEditingProduct(null);
    setProductForm({});
    if (selected) setProducts(await getSupplierProducts(selected.id));
  };

  const handleDeleteProduct = async (id: number) => {
    if (confirm("Delete this product?")) {
      await deleteSupplierProduct(id);
      if (selected) setProducts(await getSupplierProducts(selected.id));
    }
  };

  const parseImportRows = (text: string): Omit<Supplier, "id" | "created_at" | "updated_at">[] => {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return [];
    const rows = lines.map((l) => l.split(/\t/).map((c) => c.trim()));
    const isHeader =
      rows[0]?.length &&
      /^(name|име|company|фирма|phone|телефон|email)/i.test(String(rows[0][0] ?? ""));
    const dataRows = isHeader ? rows.slice(1) : rows;
    const cols = ["name", "company", "phone", "email", "address", "eik", "vat_number", "contact_person", "bank_account", "website", "offers", "notes"] as const;
    return dataRows
      .filter((r) => r[0])
      .map((r) => {
        const o: Record<string, string | null> = {};
        cols.forEach((k, i) => {
          o[k] = r[i] || null;
        });
        return o as Omit<Supplier, "id" | "created_at" | "updated_at">;
      });
  };

  const handleImport = async () => {
    const items = parseImportRows(importText);
    if (items.length === 0) {
      alert("No valid rows. Paste tab-separated data (e.g. from Excel). First row can be headers.");
      return;
    }
    const n = await createSuppliersBulk(items);
    setShowImport(false);
    setImportText("");
    loadSuppliers();
    alert(`Imported ${n} supplier(s).`);
  };

  const parseImportProducts = (text: string): Omit<SupplierProduct, "id" | "supplier_id" | "created_at">[] => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length === 0) return [];
    const cols = ["name", "brand", "model", "parameters", "price", "link", "photo_path", "technical_info"] as const;
    const rows: string[][] = [];
    let currentRow: string[] = [];
    for (const line of lines) {
      const parts = line.split(/\t/).map((c) => c.trim());
      if (currentRow.length === 0) {
        currentRow = parts;
      } else if (parts.length >= cols.length && parts[0]) {
        rows.push(currentRow.slice(0, cols.length));
        currentRow = parts;
      } else if (parts.length < cols.length && currentRow.length > 0) {
        currentRow[currentRow.length - 1] = (currentRow[currentRow.length - 1] || "") + "\n" + line.trim();
      } else {
        currentRow = [...currentRow, ...parts];
      }
    }
    if (currentRow.length > 0) rows.push(currentRow.slice(0, cols.length));
    const isHeader =
      rows[0]?.length &&
      /^(name|име|brand|марка|model|модел|price|цена|technical|техническ)/i.test(String(rows[0][0] ?? ""));
    const dataRows = isHeader ? rows.slice(1) : rows;
    return dataRows
      .filter((r) => r[0])
      .map((r) => {
        const o: Record<string, string | null> = {};
        cols.forEach((k, i) => {
          o[k] = r[i] || null;
        });
        return o as Omit<SupplierProduct, "id" | "supplier_id" | "created_at">;
      });
  };

  const handleImportProducts = async () => {
    if (!selected) return;
    const items = parseImportProducts(importProductsText);
    if (items.length === 0) {
      alert("No valid rows. Paste tab-separated data. Columns: Name, Brand, Model, Parameters, Price, Link, Photo path, Technical info. First row can be headers.");
      return;
    }
    const n = await addSupplierProductsBulk(selected.id, items);
    setShowImportProducts(false);
    setImportProductsText("");
    setProducts(await getSupplierProducts(selected.id));
    alert(`Imported ${n} product(s).`);
  };

  const handleOpenLink = (url: string) => {
    import("@tauri-apps/plugin-opener").then((mod) => mod.openUrl(url));
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
            onClick={() => {
              setEditing(selected);
              setFormData(selected);
            }}
            className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-card)] text-sm text-[var(--color-text)]"
          >
            Edit
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm max-w-2xl">
          <div><span className="text-[var(--color-accent)]">Company:</span> {selected.company || "—"}</div>
          <div><span className="text-[var(--color-accent)]">Phone:</span> {selected.phone || "—"}</div>
          <div><span className="text-[var(--color-accent)]">Email:</span> {selected.email ? <a href={`mailto:${selected.email}`} className="text-[var(--color-accent)] hover:underline">{selected.email}</a> : "—"}</div>
          <div><span className="text-[var(--color-accent)]">Website:</span>{" "}
            {selected.website ? (
              <a href={selected.website} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">{selected.website}</a>
            ) : "—"}
          </div>
          <div className="col-span-2"><span className="text-[var(--color-accent)]">Offers:</span> {selected.offers || "—"}</div>
          <div className="col-span-2"><span className="text-[var(--color-accent)]">Notes:</span> {selected.notes || "—"}</div>
        </div>
        <div className="mt-6">
          <h3 className="text-sm font-medium text-[var(--color-text-bright)] mb-3">Order Archive</h3>
          <div className="flex gap-2 mb-4">
            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
            />
            <input
              type="text"
              placeholder="Description"
              value={orderDesc}
              onChange={(e) => setOrderDesc(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm flex-1"
            />
            <input
              type="text"
              placeholder="Notes"
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm flex-1"
            />
            <button
              onClick={handleAddOrder}
              className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium"
            >
              Add
            </button>
          </div>
          <div className="space-y-2">
            {orders.map((o) => (
              <div key={o.id} className="p-3 rounded-lg bg-[var(--color-bg-card)] text-sm">
                <div className="text-[10px] text-[var(--color-accent)]/60">{formatDateTime(o.created_at)}</div>
                <div className="text-[var(--color-accent)]">{o.date}</div>
                <div className="text-[var(--color-text)]">{o.description || "—"}</div>
                {o.notes && <div className="text-[var(--color-accent)]/80 mt-1">{o.notes}</div>}
              </div>
            ))}
          </div>
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
                Columns: Name, Brand, Model, Parameters, Price, Link, Photo path, Technical info. First row can be headers. Technical info supports multiline (bullet points).
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
                <input placeholder="Name" value={productForm.name ?? ""} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm" />
                <input placeholder="Brand" value={productForm.brand ?? ""} onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })} className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm" />
                <input placeholder="Model" value={productForm.model ?? ""} onChange={(e) => setProductForm({ ...productForm, model: e.target.value })} className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm" />
                <input placeholder="Price" value={productForm.price ?? ""} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm" />
                <input placeholder="Link" value={productForm.link ?? ""} onChange={(e) => setProductForm({ ...productForm, link: e.target.value })} className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm col-span-2" />
                <input placeholder="Parameters" value={productForm.parameters ?? ""} onChange={(e) => setProductForm({ ...productForm, parameters: e.target.value })} className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm col-span-2" />
                <div className="col-span-2">
                  <label className="block text-xs text-[var(--color-accent)] mb-1">Technical Information (bullet points)</label>
                  <textarea
                    placeholder={"• Point 1\n• Point 2\n• Point 3"}
                    value={productForm.technical_info ?? ""}
                    onChange={(e) => setProductForm({ ...productForm, technical_info: e.target.value })}
                    rows={6}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm font-mono resize-y"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-[var(--color-accent)] mb-1">Photo path</label>
                  <input type="text" placeholder="C:\path\to\image.png" value={productForm.photo_path ?? ""} onChange={(e) => setProductForm({ ...productForm, photo_path: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleUpdateProduct} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm">Update</button>
                <button onClick={() => { setEditingProduct(null); setProductForm({}); }} className="px-4 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-bg-card)] mb-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Name" value={productForm.name ?? ""} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm" />
                <input placeholder="Brand" value={productForm.brand ?? ""} onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })} className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm" />
                <input placeholder="Model" value={productForm.model ?? ""} onChange={(e) => setProductForm({ ...productForm, model: e.target.value })} className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm" />
                <input placeholder="Price" value={productForm.price ?? ""} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm" />
                <input placeholder="Link" value={productForm.link ?? ""} onChange={(e) => setProductForm({ ...productForm, link: e.target.value })} className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm col-span-2" />
                <div className="col-span-2">
                  <label className="block text-xs text-[var(--color-accent)] mb-1">Technical Information (bullet points)</label>
                  <textarea
                    placeholder={"• Point 1\n• Point 2\n• Point 3"}
                    value={productForm.technical_info ?? ""}
                    onChange={(e) => setProductForm({ ...productForm, technical_info: e.target.value })}
                    rows={6}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm font-mono resize-y"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-[var(--color-accent)] mb-1">Photo path</label>
                  <input type="text" placeholder="C:\path\to\image.png" value={productForm.photo_path ?? ""} onChange={(e) => setProductForm({ ...productForm, photo_path: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm" />
                </div>
              </div>
              <button onClick={handleAddProduct} disabled={!productForm.name} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm">Add Product</button>
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
                  <th className="px-3 py-1.5 font-medium max-w-[180px]">Technical Info</th>
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
                    <td className="px-3 py-1.5 text-[var(--color-text)] max-w-[280px] align-top">
                      {p.technical_info ? (
                        <div className="flex gap-1 items-start">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleTechInfo(p.id); }}
                            className="shrink-0 mt-0.5 text-[var(--color-accent)] hover:text-[var(--color-text)] text-xs"
                            title={expandedTechInfoIds.has(p.id) ? "Collapse" : "Expand"}
                          >
                            {expandedTechInfoIds.has(p.id) ? "▼" : "▶"}
                          </button>
                          <div
                            className={`text-xs whitespace-pre-wrap ${expandedTechInfoIds.has(p.id) ? "" : "line-clamp-2"}`}
                            title={!expandedTechInfoIds.has(p.id) ? p.technical_info : undefined}
                          >
                            {p.technical_info}
                          </div>
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      {p.photo_path ? (
                        <img src={convertFileSrc(p.photo_path)} alt="" className="w-8 h-8 object-cover rounded" />
                      ) : "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1">
                        {p.link && (
                          <button onClick={() => handleOpenLink(p.link!)} className="px-2 py-1 rounded text-[var(--color-accent)] hover:bg-[var(--color-bg-card)] text-xs">Link</button>
                        )}
                        <button onClick={() => { setEditingProduct(p); setProductForm(p); }} className="px-2 py-1 rounded text-[var(--color-accent)] hover:bg-[var(--color-bg-card)] text-xs">Edit</button>
                        <button onClick={() => handleDeleteProduct(p.id)} className="px-2 py-1 rounded text-red-400/80 hover:bg-red-500/20 text-xs">Delete</button>
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
  const formTitle = editing ? "Edit Supplier" : "Add Supplier";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-medium text-[var(--color-text-bright)]">Suppliers</h1>
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
          Add Supplier
        </button>
        </div>
      </div>

      {supplierSelection.selectedIds.size > 0 && (
        <div className="flex items-center gap-4 px-4 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-bg-card)]">
          <span className="text-sm text-[var(--color-accent)]">{supplierSelection.selectedIds.size} selected</span>
          <button onClick={handleBulkDeleteSuppliers} className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30">Delete selected</button>
          <button onClick={supplierSelection.clearAll} className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-xs">Clear selection</button>
        </div>
      )}

      {showImport && (
        <div className="p-4 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-bg-card)]">
          <h3 className="text-sm font-medium text-[var(--color-text-bright)] mb-2">Import suppliers (paste from Excel)</h3>
          <p className="text-xs text-[var(--color-accent)]/80 mb-2">
            Paste tab-separated data. Columns: Name, Company, Phone, Email, Address, EIK, VAT, Contact Person, Bank Account, Website, Offers, Notes. First row can be headers.
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste your data here..."
            rows={8}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] font-mono text-sm mb-2"
          />
          <div className="flex gap-2">
            <button onClick={handleImport} className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium">Import</button>
            <button onClick={() => { setShowImport(false); setImportText(""); }} className="px-4 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm">Cancel</button>
          </div>
        </div>
      )}

      {isFormOpen && (
        <div className="p-4 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-bg-card)] max-w-xl space-y-4">
          <h3 className="text-sm font-medium">{formTitle}</h3>
          <div className="grid grid-cols-2 gap-4">
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
              <label className="block text-xs text-[var(--color-accent)] mb-1">Company</label>
              <input
                type="text"
                value={formData.company ?? ""}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-accent)] mb-1">Phone</label>
              <input
                type="text"
                value={formData.phone ?? ""}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-accent)] mb-1">Email</label>
              <input
                type="email"
                value={formData.email ?? ""}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)]"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-[var(--color-accent)] mb-1">Website</label>
              <input
                type="url"
                value={formData.website ?? ""}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)]"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-[var(--color-accent)] mb-1">What they offer</label>
              <textarea
                value={formData.offers ?? ""}
                onChange={(e) => setFormData({ ...formData, offers: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)]"
              />
            </div>
            <div className="col-span-2">
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
                <input type="checkbox" checked={suppliers.length > 0 && suppliers.every((s) => supplierSelection.isSelected(s.id))} onChange={() => supplierSelection.toggleAll(suppliers)} className="rounded border-[var(--color-bg-card)]" />
              </th>
              <th className="px-3 py-1.5 font-medium">Name</th>
              <th className="px-3 py-1.5 font-medium">Company</th>
              <th className="px-3 py-1.5 font-medium">Website</th>
              <th className="px-3 py-1.5 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s, idx) => (
              <tr
                key={s.id}
                className="border-t border-[var(--color-bg-card)] hover:bg-[var(--color-bg-card)]/30 cursor-pointer"
                onClick={() => {
                  nav.push({ restore: () => setSelected(null) });
                  setSelected(s);
                }}
              >
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={supplierSelection.isSelected(s.id)} onChange={() => {}} onClick={(e) => { e.stopPropagation(); supplierSelection.toggle(s.id, idx, suppliers, e.shiftKey); }} className="rounded border-[var(--color-bg-card)]" />
                </td>
                <td className="px-3 py-1.5">
                  <div className="text-[10px] text-[var(--color-accent)]/60">{formatDateTime(s.updated_at || s.created_at)}</div>
                  <div className="text-[var(--color-text-bright)]">{s.name}</div>
                </td>
                <td className="px-3 py-1.5 text-[var(--color-text)]">{s.company || "—"}</td>
                <td className="px-3 py-1.5 text-[var(--color-text)]">{s.website || "—"}</td>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setEditing(s); setFormData(s); }}
                      className="px-2 py-1 rounded text-[var(--color-accent)] hover:bg-[var(--color-bg-card)] text-xs"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
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
