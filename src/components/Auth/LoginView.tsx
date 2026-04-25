import { useState } from "react";
import { loginStaffUser } from "../../lib/db";
import { clearStaffUserSession } from "../../lib/session";
import { resolveCompanyAdminPinProfile } from "../../lib/companyAccess";
import type { LoginSuccessPayload } from "../../lib/auth";
import { initialsFromFullName } from "../../lib/format";

interface LoginViewProps {
  companyId: number;
  onSuccess: (payload: LoginSuccessPayload) => void;
  /** Връщане към екрана за въвеждане на код (друга фирма). */
  onBackToAccessCode: () => void;
}

export function LoginView({ companyId, onSuccess, onBackToAccessCode }: LoginViewProps) {
  const [tab, setTab] = useState<"admin" | "staff">("admin");
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submitAdmin = async () => {
    setError(null);
    if (pin.length !== 6) {
      setError("Въведете 6 цифри.");
      return;
    }
    setLoading(true);
    try {
      const p = await resolveCompanyAdminPinProfile(companyId, pin);
      if (p.ok && p.kind === "main") {
        clearStaffUserSession();
        onSuccess({ role: "admin", rememberMe, adminActor: { v: 1, kind: "main" } });
        return;
      }
      if (p.ok && p.kind === "alternate") {
        clearStaffUserSession();
        const label = p.label;
        onSuccess({
          role: "admin",
          rememberMe,
          adminActor: { v: 1, kind: "named", label, initials: initialsFromFullName(label) },
        });
        return;
      }
      setError("Неверен PIN.");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const submitStaff = async () => {
    setError(null);
    if (!username.trim() || !password) {
      setError("Потребител и парола са задължителни.");
      return;
    }
    setLoading(true);
    try {
      const u = await loginStaffUser(username, password, companyId);
      onSuccess({ role: "clients", staffUserId: u.id, staffUsername: u.username, rememberMe });
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
        <p className="text-xs text-[var(--color-accent)] text-center mb-4">Вход</p>

        <div className="flex rounded-lg bg-[var(--color-bg-card)]/50 p-0.5 mb-6">
          <button
            type="button"
            onClick={() => { setTab("admin"); setError(null); }}
            className={`flex-1 py-2 rounded-md text-xs font-medium transition-colors ${
              tab === "admin" ? "bg-[var(--color-bg-card)] text-[var(--color-text-bright)]" : "text-[var(--color-accent)]"
            }`}
          >
            Администратор
          </button>
          <button
            type="button"
            onClick={() => { setTab("staff"); setError(null); }}
            className={`flex-1 py-2 rounded-md text-xs font-medium transition-colors ${
              tab === "staff" ? "bg-[var(--color-bg-card)] text-[var(--color-text-bright)]" : "text-[var(--color-accent)]"
            }`}
          >
            Служител
          </button>
        </div>

        {tab === "admin" ? (
          <>
            <label className="block text-xs text-[var(--color-accent)] mb-2">PIN (6 цифри)</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && submitAdmin()}
              className="w-full px-4 py-3 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-center text-2xl tracking-[0.4em] text-[var(--color-text-bright)] focus:outline-none focus:border-[var(--color-accent)]"
              placeholder="••••••"
              disabled={loading}
              autoFocus
            />
            <button
              type="button"
              onClick={submitAdmin}
              disabled={loading || pin.length !== 6}
              className="mt-6 w-full py-3 rounded-lg text-sm font-medium bg-[var(--color-bg-card)] text-[var(--color-text-bright)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? "Проверка…" : "Вход"}
            </button>
            <label className="mt-3 flex items-center gap-2 text-xs text-[var(--color-accent)]">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-[var(--color-bg-card)]"
                disabled={loading}
              />
              Запомни ме
            </label>
          </>
        ) : (
          <>
            <label className="block text-xs text-[var(--color-accent)] mb-2">Потребител</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitStaff()}
              className="w-full px-4 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-sm text-[var(--color-text-bright)] mb-3 focus:outline-none focus:border-[var(--color-accent)]"
              placeholder="потребителско име"
              autoComplete="username"
              disabled={loading}
              autoFocus
            />
            <label className="block text-xs text-[var(--color-accent)] mb-2">Парола</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitStaff()}
              className="w-full px-4 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-sm text-[var(--color-text-bright)] mb-4 focus:outline-none focus:border-[var(--color-accent)]"
              autoComplete="current-password"
              disabled={loading}
            />
            <button
              type="button"
              onClick={submitStaff}
              disabled={loading || !username.trim() || !password}
              className="w-full py-3 rounded-lg text-sm font-medium bg-[var(--color-bg-card)] text-[var(--color-text-bright)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? "Проверка…" : "Вход"}
            </button>
            <label className="mt-3 flex items-center gap-2 text-xs text-[var(--color-accent)]">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-[var(--color-bg-card)]"
                disabled={loading}
              />
              Запомни ме
            </label>
          </>
        )}

        {error && <p className="mt-3 text-sm text-red-400/90 text-center">{error}</p>}

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={onBackToAccessCode}
            className="text-[11px] text-[var(--color-accent)]/80 underline-offset-2 hover:text-[var(--color-text-bright)] hover:underline"
          >
            Друг код за достъп
          </button>
        </div>

        <p className="mt-4 text-[10px] text-[var(--color-accent)]/70 text-center leading-relaxed">
          Администраторът има пълен достъп и настройки за служители. Служителите виждат само клиенти и статистика за собствените си действия.
        </p>
      </div>
    </div>
  );
}
