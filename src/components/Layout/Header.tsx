import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { AppRole } from "../../lib/auth";
import { exportDatabaseSnapshot } from "../../lib/db";
import { GlobalSearch } from "../Search/GlobalSearch";
import type { SearchResult } from "../../lib/db";
import { useNav } from "../../lib/navHistory";

interface HeaderProps {
  role: AppRole;
  onLogout: () => void;
  onSearchSelect?: (result: SearchResult) => void;
  onSearchEnter?: (query: string) => void;
}

export function Header({ role, onLogout, onSearchSelect, onSearchEnter }: HeaderProps) {
  const nav = useNav();
  const handleBackup = async () => {
    try {
      const date = new Date().toISOString().slice(0, 10);
      const path = await save({
        defaultPath: `rxg_call_hub_backup_${date}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (path) {
        const json = await exportDatabaseSnapshot();
        await invoke("save_text_file", { path, contents: json });
        alert("Резервното копие (JSON) е записано.");
      }
    } catch (e) {
      alert(`Backup failed: ${e}`);
    }
  };

  return (
    <header className="h-12 flex items-center justify-between gap-4 px-4 border-b border-[var(--color-bg-card)] bg-[var(--color-bg-secondary)]">
      <div className="flex items-center gap-4 min-w-0">
        {nav.depth > 0 && (
          <button
            type="button"
            onClick={() => nav.back()}
            title="Назад"
            aria-label="Назад"
            className="px-2 py-1 rounded-lg text-[var(--color-accent)] hover:bg-[var(--color-bg-card)] transition-colors text-sm flex items-center gap-1"
          >
            <span aria-hidden>←</span>
            <span className="hidden sm:inline">Назад</span>
          </button>
        )}
        <div className="flex-shrink-0">
          <h1 className="text-sm font-medium text-[var(--color-text-bright)] tracking-tight">
            RXG call hub
          </h1>
        </div>
        {onSearchSelect && (
          <GlobalSearch
            onSelect={onSearchSelect}
            onSearchEnter={onSearchEnter}
            clientsOnly={role === "clients"}
          />
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {role === "admin" && (
          <button
            onClick={handleBackup}
            className="px-3 py-1.5 rounded-lg text-xs text-[var(--color-accent)] hover:bg-[var(--color-bg-card)] transition-colors"
          >
            Backup
          </button>
        )}
        <button
          type="button"
          onClick={onLogout}
          className="px-3 py-1.5 rounded-lg text-xs text-[var(--color-text)]/80 hover:bg-[var(--color-bg-card)] transition-colors"
        >
          Изход
        </button>
      </div>
    </header>
  );
}
