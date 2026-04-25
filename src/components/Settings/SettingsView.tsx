import { useEffect, useState } from "react";
import {
  listStaffUsers,
  createStaffUser,
  updateStaffUserPassword,
  setStaffUserActive,
  deleteStaffUser,
  listConversationTextScripts,
  saveConversationTextScripts,
  type ConversationTextScript,
  type StaffUser,
} from "../../lib/db";

export function SettingsView() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [pwEditId, setPwEditId] = useState<number | null>(null);
  const [pwEditValue, setPwEditValue] = useState("");
  const [scriptSummary, setScriptSummary] = useState<string | null>(null);
  const [scripts, setScripts] = useState<ConversationTextScript[]>([]);
  const [importingScripts, setImportingScripts] = useState(false);

  const load = async () => {
    setErr(null);
    try {
      setUsers(await listStaffUsers());
      setScripts(await listConversationTextScripts());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!newUsername.trim() || !newPassword) return;
    setErr(null);
    try {
      await createStaffUser(newUsername, newPassword, newDisplayName || null);
      setNewUsername("");
      setNewPassword("");
      setNewDisplayName("");
      await load();
    } catch (e) {
      setErr(String(e));
    }
  };

  const handleChangePassword = async (id: number) => {
    if (!pwEditValue || pwEditValue.length < 4) return;
    setErr(null);
    try {
      await updateStaffUserPassword(id, pwEditValue);
      setPwEditId(null);
      setPwEditValue("");
    } catch (e) {
      setErr(String(e));
    }
  };

  const handleToggleActive = async (u: StaffUser) => {
    setErr(null);
    try {
      await setStaffUserActive(u.id, !u.is_active);
      await load();
    } catch (e) {
      setErr(String(e));
    }
  };

  const handleDelete = async (u: StaffUser) => {
    if (!confirm(`Изтриване на служител „${u.username}“?`)) return;
    setErr(null);
    try {
      await deleteStaffUser(u.id);
      await load();
    } catch (e) {
      setErr(String(e));
    }
  };

  const handleScriptsTextUpload = async (files: FileList) => {
    setErr(null);
    setScriptSummary(null);
    setImportingScripts(true);
    try {
      const current = await listConversationTextScripts();
      const byId = new Map(current.map((s) => [s.id, s]));
      let imported = 0;
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith(".txt")) continue;
        const content = await file.text();
        if (!content.trim()) continue;
        const id = file.name.replace(/\.txt$/i, "").trim().toLowerCase().replace(/\s+/g, "_");
        byId.set(id, {
          id,
          name: file.name.replace(/\.txt$/i, ""),
          content: content.replace(/\r\n/g, "\n"),
          updated_at: new Date().toISOString(),
        });
        imported++;
      }
      const merged = [...byId.values()];
      await saveConversationTextScripts(merged);
      setScripts(merged.sort((a, b) => a.name.localeCompare(b.name, "bg")));
      setScriptSummary(`Качени/обновени текстови скриптове: ${imported}. Общо: ${merged.length}.`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setImportingScripts(false);
    }
  };

  const handleDeleteScript = async (id: string) => {
    const next = scripts.filter((s) => s.id !== id);
    await saveConversationTextScripts(next);
    setScripts(next);
    setScriptSummary(`Изтрит скрипт. Общо: ${next.length}.`);
  };

  if (loading) {
    return <div className="text-sm text-[var(--color-accent)]">Зареждане…</div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-lg font-medium text-[var(--color-text-bright)]">Настройки</h1>
        <p className="text-xs text-[var(--color-accent)] mt-1">
          Служители с достъп „clients“: влизат с потребител и парола и виждат в статистиката само собствените си действия.
        </p>
      </div>

      {err && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</div>
      )}

      <div className="p-4 rounded-lg border border-[var(--color-bg-card)] bg-[var(--color-bg-secondary)] space-y-3">
        <h2 className="text-sm font-medium text-[var(--color-text-bright)]">Нов служител</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="block text-[10px] text-[var(--color-accent)] mb-1">Потребител (латиница/цифри)</label>
            <input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-sm text-[var(--color-text)]"
              placeholder="ivan.petrov"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-[10px] text-[var(--color-accent)] mb-1">Парола (мин. 4 символа)</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-sm text-[var(--color-text)]"
              autoComplete="new-password"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[10px] text-[var(--color-accent)] mb-1">Показвано име (по избор)</label>
            <input
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-sm text-[var(--color-text)]"
              placeholder="Иван Петров"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={newUsername.trim().length < 2 || newPassword.length < 4}
          className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg-primary)] text-sm font-medium disabled:opacity-40"
        >
          Създай акаунт
        </button>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-[var(--color-text-bright)]">Служители</h2>
        {users.length === 0 ? (
          <p className="text-sm text-[var(--color-accent)]">Няма създадени акаунти.</p>
        ) : (
          <ul className="space-y-2">
            {users.map((u) => (
              <li
                key={u.id}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg border border-[var(--color-bg-card)] bg-[var(--color-bg-card)]/40 text-sm"
              >
                <div>
                  <div className="font-medium text-[var(--color-text-bright)]">{u.display_name || u.username}</div>
                  <div className="text-xs text-[var(--color-accent)]">
                    @{u.username}
                    {!u.is_active && <span className="ml-2 text-amber-400">(деактивиран)</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {pwEditId === u.id ? (
                    <>
                      <input
                        type="password"
                        placeholder="Нова парола"
                        value={pwEditValue}
                        onChange={(e) => setPwEditValue(e.target.value)}
                        className="px-2 py-1 rounded bg-[var(--color-bg-secondary)] text-xs w-36"
                      />
                      <button
                        type="button"
                        onClick={() => handleChangePassword(u.id)}
                        className="px-2 py-1 rounded bg-[var(--color-accent)]/20 text-xs text-[var(--color-text-bright)]"
                      >
                        Запази
                      </button>
                      <button type="button" onClick={() => { setPwEditId(null); setPwEditValue(""); }} className="text-xs text-[var(--color-accent)]">
                        Отказ
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setPwEditId(u.id); setPwEditValue(""); }}
                      className="px-2 py-1 rounded text-xs text-[var(--color-accent)] hover:bg-[var(--color-bg-card)]"
                    >
                      Парола
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleToggleActive(u)}
                    className="px-2 py-1 rounded text-xs text-[var(--color-accent)] hover:bg-[var(--color-bg-card)]"
                  >
                    {u.is_active ? "Деактивирай" : "Активирай"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(u)}
                    className="px-2 py-1 rounded text-xs text-red-400/90 hover:bg-red-500/10"
                  >
                    Изтрий
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="p-4 rounded-lg border border-[var(--color-bg-card)] bg-[var(--color-bg-secondary)] space-y-3">
        <h2 className="text-sm font-medium text-[var(--color-text-bright)]">Скриптове за разговори (TXT)</h2>
        <p className="text-xs text-[var(--color-accent)]/90">
          Качи един или няколко <code>.txt</code> файла. Всеки файл става отделен скрипт. Съдържанието се показва в Conversations като collapsable помощен текст.
        </p>
        <input
          type="file"
          multiple
          accept=".txt"
          disabled={importingScripts}
          onChange={async (e) => {
            const files = e.target.files;
            if (!files?.length) return;
            await handleScriptsTextUpload(files);
            e.currentTarget.value = "";
          }}
          className="block w-full text-xs text-[var(--color-text)] file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-[var(--color-bg-card)] file:text-[var(--color-text)]"
        />
        {scriptSummary && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            {scriptSummary}
          </div>
        )}
        {scripts.length > 0 && (
          <div className="space-y-1">
            {scripts.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-xs bg-[var(--color-bg-card)]/40 rounded px-2 py-1.5">
                <span className="text-[var(--color-text)]">{s.name}</span>
                <button type="button" onClick={() => handleDeleteScript(s.id)} className="text-red-400/90 hover:underline">
                  Изтрий
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[10px] text-[var(--color-accent)]/70">
        Изпълни в Supabase миграциите <code className="text-[var(--color-text-bright)]">015_staff_users.sql</code> и{" "}
        <code className="text-[var(--color-text-bright)]">016_client_activity_actor_user.sql</code>,{" "}
        <code className="text-[var(--color-text-bright)]">021_clients_visibility_and_soft_delete.sql</code>,{" "}
        <code className="text-[var(--color-text-bright)]">022_conversation_scripts_and_machine_knowledge.sql</code>,{" "}
        <code className="text-[var(--color-text-bright)]">023_script_tables_rls_policy.sql</code>, ако таблиците липсват.
      </p>
    </div>
  );
}
