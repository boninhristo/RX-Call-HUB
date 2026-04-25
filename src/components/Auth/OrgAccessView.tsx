import { useState } from "react";
import { lookupCompanyByCode } from "../../lib/companyAccess";
import { setCompanyContext } from "../../lib/session";

interface OrgAccessViewProps {
  onResolved: (companyId: number) => void;
}

/** Първи екран: неутрален достъп по код (без текст за множество фирми). */
export function OrgAccessView({ onResolved }: OrgAccessViewProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Въведете код.");
      return;
    }
    setLoading(true);
    try {
      const row = await lookupCompanyByCode(trimmed);
      if (!row) {
        setError("Невалиден код.");
        return;
      }
      setCompanyContext(row.id, trimmed);
      onResolved(row.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-bg-primary)] p-6">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-bg-card)] bg-[var(--color-bg-secondary)] p-8 shadow-lg">
        <h1 className="text-lg font-medium text-[var(--color-text-bright)] text-center mb-1">RXG call hub</h1>
        <p className="text-xs text-[var(--color-accent)] text-center mb-4">Достъп</p>

        <label className="block text-xs text-[var(--color-accent)] mb-2">Код</label>
        <input
          type="text"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="w-full px-4 py-3 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-sm text-[var(--color-text-bright)] focus:outline-none focus:border-[var(--color-accent)]"
          placeholder=""
          disabled={loading}
          autoFocus
        />
        <button
          type="button"
          onClick={submit}
          disabled={loading || !code.trim()}
          className="mt-6 w-full py-3 rounded-lg text-sm font-medium bg-[var(--color-bg-card)] text-[var(--color-text-bright)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {loading ? "Проверка…" : "Напред"}
        </button>

        {error && <p className="mt-3 text-sm text-red-400/90 text-center">{error}</p>}

        <p
          className="mt-6 pt-4 border-t border-[var(--color-bg-card)] text-center text-[10px] tracking-[0.2em] uppercase text-[var(--color-accent)]/75"
          aria-label={`Версия ${__APP_VERSION__}`}
        >
          build {__APP_VERSION__}
        </p>
      </div>
    </div>
  );
}
