import { useState, useCallback } from "react";

export function useTableSelection<T extends { id: number }>() {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  const toggle = useCallback((id: number, index: number, items: T[], shiftKey: boolean) => {
    if (shiftKey && lastClickedIndex !== null) {
      const from = Math.min(lastClickedIndex, index);
      const to = Math.max(lastClickedIndex, index);
      const idsInRange = items.slice(from, to + 1).map((x) => x.id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        idsInRange.forEach((id) => next.add(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setLastClickedIndex(index);
    }
  }, [lastClickedIndex]);

  const selectAll = useCallback((items: T[]) => {
    setSelectedIds(new Set(items.map((x) => x.id)));
  }, []);

  const clearAll = useCallback(() => {
    setSelectedIds(new Set());
    setLastClickedIndex(null);
  }, []);

  const toggleAll = useCallback((items: T[]) => {
    const allSelected = items.length > 0 && items.every((x) => selectedIds.has(x.id));
    if (allSelected) clearAll();
    else selectAll(items);
  }, [selectedIds, selectAll, clearAll]);

  const isSelected = useCallback((id: number) => selectedIds.has(id), [selectedIds]);

  const getSelectedIds = useCallback(() => Array.from(selectedIds), [selectedIds]);

  /** Заменя селекцията (напр. всички id от филтъра на няколко страници). */
  const selectAllByIds = useCallback((ids: number[]) => {
    setSelectedIds(new Set(ids));
    setLastClickedIndex(null);
  }, []);

  return {
    selectedIds,
    lastClickedIndex,
    toggle,
    selectAll,
    clearAll,
    toggleAll,
    selectAllByIds,
    isSelected,
    getSelectedIds,
  };
}
