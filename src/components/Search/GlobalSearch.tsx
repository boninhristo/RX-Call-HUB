import { useState, useEffect, useRef } from "react";
import { globalSearchClientsOnly, globalSearchFull, type SearchResult } from "../../lib/db";

const TYPE_LABELS: Record<Exclude<SearchResult["type"], "supplier_product">, string> = {
  client: "Clients",
  supplier: "Suppliers",
  transport_supplier: "Transport",
  competitor: "Competition",
};

interface GlobalSearchProps {
  onSelect: (result: SearchResult) => void;
  onSearchEnter?: (query: string) => void;
  /** Само клиенти (роля clients). */
  clientsOnly?: boolean;
}

export function GlobalSearch({ onSelect, onSearchEnter, clientsOnly }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [mainResults, setMainResults] = useState<SearchResult[]>([]);
  const [supplierProducts, setSupplierProducts] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setMainResults([]);
      setSupplierProducts([]);
      setOpen(false);
      return;
    }
    setOpen(true);
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { main, supplierProducts: sp } = clientsOnly
          ? await globalSearchClientsOnly(query)
          : await globalSearchFull(query);
        setMainResults(main);
        setSupplierProducts(sp);
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [query, clientsOnly]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (r: SearchResult) => {
    onSelect(r);
    setQuery("");
    setOpen(false);
  };

  const grouped = mainResults
    .filter((r): r is Exclude<SearchResult, { type: "supplier_product" }> => r.type !== "supplier_product")
    .reduce<Record<string, SearchResult[]>>((acc, r) => {
      const key = TYPE_LABELS[r.type as keyof typeof TYPE_LABELS];
      if (!acc[key]) acc[key] = [];
      acc[key].push(r);
      return acc;
    }, {});

  const hasResults = Object.keys(grouped).length > 0 || supplierProducts.length > 0;

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md">
      <input
        type="search"
        placeholder={clientsOnly ? "Търсене в клиенти…" : "Search... (Enter for full results)"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query.trim() && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim() && onSearchEnter) {
            onSearchEnter(query.trim());
            setOpen(false);
          }
        }}
        className="w-full px-3 py-1.5 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-[var(--color-text)] placeholder:text-[var(--color-accent)]/60 focus:outline-none focus:border-[var(--color-accent)] text-sm"
      />
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-bg-card)] shadow-lg z-50 max-h-80 overflow-auto">
          {loading ? (
            <div className="p-4 text-[var(--color-accent)] text-sm">Searching...</div>
          ) : !hasResults ? (
            <div className="p-4 text-[var(--color-accent)] text-sm">No results</div>
          ) : (
            <>
              {Object.entries(grouped).map(([type, items]) => (
                <div key={type} className="border-b border-[var(--color-bg-card)]">
                  <div className="px-3 py-1.5 text-xs text-[var(--color-accent)] bg-[var(--color-bg-card)]/50">
                    {type}
                  </div>
                  {items.map((r) => (
                    <button
                      key={`${r.type}-${r.id}`}
                      onClick={() => handleSelect(r)}
                      className="w-full text-left px-3 py-2 hover:bg-[var(--color-bg-card)]/50 text-sm flex flex-col"
                    >
                      <span className="text-[var(--color-text-bright)]">{r.label}</span>
                      {r.sublabel && (
                        <span className="text-xs text-[var(--color-accent)]">{r.sublabel}</span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
              {supplierProducts.length > 0 && (
                <div className="border-b border-[var(--color-bg-card)] last:border-0">
                  <div className="px-3 py-1.5 text-xs text-[var(--color-accent)] bg-[var(--color-bg-card)]/50">
                    Products (Suppliers)
                  </div>
                  {supplierProducts.map((r) => (
                    <button
                      key={`${r.type}-${r.id}-${r.productId ?? 0}`}
                      onClick={() => handleSelect(r)}
                      className="w-full text-left px-3 py-2 hover:bg-[var(--color-bg-card)]/50 text-sm flex flex-col gap-0.5"
                    >
                      <span className="text-[var(--color-text-bright)]">{r.label}</span>
                      {r.sublabel && (
                        <span className="text-xs text-[var(--color-accent)]">{r.sublabel}</span>
                      )}
                      {(r.brand || r.model || r.price) && (
                        <span className="text-xs text-[var(--color-text)]/80">
                          {[r.brand, r.model, r.price].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
