import { useState, useEffect } from "react";
import { globalSearchClientsOnly, globalSearchFull, type SearchResult } from "../../lib/db";

const TYPE_LABELS: Record<Exclude<SearchResult["type"], "supplier_product">, string> = {
  client: "Clients",
  supplier: "Suppliers",
  transport_supplier: "Transport",
  competitor: "Competition",
};

interface SearchResultsViewProps {
  query: string;
  onSelect: (result: SearchResult) => void;
  onBack: () => void;
  clientsOnly?: boolean;
}

export function SearchResultsView({ query, onSelect, onBack, clientsOnly }: SearchResultsViewProps) {
  const [mainResults, setMainResults] = useState<SearchResult[]>([]);
  const [supplierProducts, setSupplierProducts] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (clientsOnly ? globalSearchClientsOnly(query) : globalSearchFull(query)).then(({ main, supplierProducts: sp }) => {
      if (!cancelled) {
        setMainResults(main);
        setSupplierProducts(sp);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [query, clientsOnly]);

  const grouped = mainResults
    .filter((r): r is Exclude<SearchResult, { type: "supplier_product" }> => r.type !== "supplier_product")
    .reduce<Record<string, SearchResult[]>>((acc, r) => {
      const key = TYPE_LABELS[r.type as keyof typeof TYPE_LABELS];
      if (!acc[key]) acc[key] = [];
      acc[key].push(r);
      return acc;
    }, {});

  const hasMain = Object.keys(grouped).length > 0;
  const hasSubcategories = supplierProducts.length > 0;
  const hasResults = hasMain || hasSubcategories;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="text-[var(--color-accent)] hover:text-[var(--color-text)] text-sm"
        >
          ← Back
        </button>
        <h1 className="text-lg font-medium text-[var(--color-text-bright)]">
          Search: &quot;{query}&quot;
        </h1>
      </div>

      {loading ? (
        <div className="p-4 text-[var(--color-accent)] text-sm">Searching...</div>
      ) : !hasResults ? (
        <div className="p-4 text-[var(--color-accent)] text-sm">No results</div>
      ) : (
        <div className="space-y-6">
          {hasMain && (
            <>
              {Object.entries(grouped).map(([category, items]) => (
                <div key={category}>
                  <h2 className="text-sm font-medium text-[var(--color-accent)] mb-2">
                    {category}
                  </h2>
                  <div className="rounded-lg border border-[var(--color-bg-card)] overflow-hidden">
                    <div className="divide-y divide-[var(--color-bg-card)]">
                      {items.map((r) => (
                        <button
                          key={`${r.type}-${r.id}`}
                          onClick={() => onSelect(r)}
                          className="w-full text-left px-4 py-3 hover:bg-[var(--color-bg-card)]/50 text-sm flex flex-col transition-colors"
                        >
                          <span className="text-[var(--color-text-bright)]">{r.label}</span>
                          {r.sublabel && (
                            <span className="text-xs text-[var(--color-accent)] mt-0.5">
                              {r.sublabel}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
          {hasSubcategories && (
            <div>
              <h2 className="text-sm font-medium text-[var(--color-accent)] mb-2">
                Products (Suppliers)
              </h2>
              <div className="rounded-lg border border-[var(--color-bg-card)] overflow-hidden">
                <div className="divide-y divide-[var(--color-bg-card)]">
                  {supplierProducts.map((r) => (
                    <button
                      key={`${r.type}-${r.id}-${r.productId ?? 0}`}
                      onClick={() => onSelect(r)}
                      className="w-full text-left px-4 py-3 hover:bg-[var(--color-bg-card)]/50 text-sm flex flex-col gap-1 transition-colors"
                    >
                      <span className="text-[var(--color-text-bright)] font-medium">{r.label}</span>
                      {r.sublabel && (
                        <span className="text-xs text-[var(--color-accent)]">Supplier: {r.sublabel}</span>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--color-text)]/90 mt-1">
                        {r.brand && <span>Brand: {r.brand}</span>}
                        {r.model && <span>Model: {r.model}</span>}
                        {r.price && <span>Price: {r.price}</span>}
                        {r.parameters && (
                        <span title={r.parameters}>
                          Parameters: {r.parameters.length > 60 ? `${r.parameters.slice(0, 60)}…` : r.parameters}
                        </span>
                      )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
