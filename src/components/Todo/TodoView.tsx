import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPersonalTodo,
  deletePersonalTodo,
  listPersonalTodos,
  togglePersonalTodoDone,
  updatePersonalTodo,
  type PersonalTodo,
  type PersonalTodoRecurrence,
} from "../../lib/db";
import { formatDateTime } from "../../lib/format";
import { getCurrentTodoOwner, type TodoOwner } from "../../lib/todoOwner";

interface TodoViewProps {
  /** Извиква се след всяка успешна промяна (за refresh на sidebar badge). */
  onChanged?: () => void;
}

const RECURRENCE_LABELS: Record<PersonalTodoRecurrence, string> = {
  none: "Без повторение",
  daily: "Всеки ден",
  weekly: "Всяка седмица",
  monthly: "Всеки месец",
};

const RECURRENCE_ORDER: PersonalTodoRecurrence[] = ["none", "daily", "weekly", "monthly"];

function isoToDatetimeLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da}T${h}:${m}`;
}

function dueState(dueAt: string | null): "overdue" | "today" | "upcoming" | "none" {
  if (!dueAt) return "none";
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return "none";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const startTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  if (d.getTime() < now.getTime() && d.getTime() < startToday.getTime()) return "overdue";
  if (d.getTime() < now.getTime()) return "overdue";
  if (d.getTime() < startTomorrow.getTime()) return "today";
  return "upcoming";
}

function dueAccentClasses(state: "overdue" | "today" | "upcoming" | "none"): string {
  if (state === "overdue") return "border-red-500/50 bg-red-500/10";
  if (state === "today") return "border-amber-400/50 bg-amber-400/10";
  return "border-[var(--color-bg-card)] bg-[var(--color-bg-card)]/40";
}

export function TodoView({ onChanged }: TodoViewProps) {
  const [owner, setOwner] = useState<TodoOwner | null>(() => getCurrentTodoOwner());
  const [items, setItems] = useState<PersonalTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Inline „add“ form.
  const [newNote, setNewNote] = useState("");
  const [newDue, setNewDue] = useState("");
  const [newRec, setNewRec] = useState<PersonalTodoRecurrence>("none");
  const [adding, setAdding] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  // Inline edit state (за избран ред).
  const [editId, setEditId] = useState<number | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editRec, setEditRec] = useState<PersonalTodoRecurrence>("none");

  useEffect(() => {
    setOwner(getCurrentTodoOwner());
  }, []);

  const load = useCallback(async () => {
    if (!owner) return;
    setLoading(true);
    setErr(null);
    try {
      const rows = await listPersonalTodos({ kind: owner.kind, key: owner.key }, showDone);
      setItems(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [owner, showDone]);

  useEffect(() => {
    if (!owner) return;
    void load();
  }, [load, owner]);

  const ownerRef = useMemo(
    () => (owner ? { kind: owner.kind, key: owner.key } : null),
    [owner]
  );

  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!ownerRef) return;
      const note = newNote.trim();
      if (!note) {
        noteRef.current?.focus();
        return;
      }
      setAdding(true);
      try {
        await createPersonalTodo({
          owner: ownerRef,
          note,
          dueAt: newDue || null,
          recurrence: newRec,
        });
        setNewNote("");
        setNewDue("");
        setNewRec("none");
        await load();
        onChanged?.();
      } catch (e2) {
        alert(e2 instanceof Error ? e2.message : String(e2));
      } finally {
        setAdding(false);
      }
    },
    [ownerRef, newNote, newDue, newRec, load, onChanged]
  );

  const handleToggleDone = useCallback(
    async (id: number) => {
      if (!ownerRef) return;
      setBusyId(id);
      try {
        await togglePersonalTodoDone(id, ownerRef);
        await load();
        onChanged?.();
      } catch (e) {
        alert(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyId(null);
      }
    },
    [ownerRef, load, onChanged]
  );

  const handleDelete = useCallback(
    async (id: number) => {
      if (!ownerRef) return;
      if (!confirm("Да изтрия ли тази задача?")) return;
      setBusyId(id);
      try {
        await deletePersonalTodo(id, ownerRef);
        if (editId === id) setEditId(null);
        await load();
        onChanged?.();
      } catch (e) {
        alert(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyId(null);
      }
    },
    [ownerRef, load, onChanged, editId]
  );

  const startEdit = useCallback((row: PersonalTodo) => {
    setEditId(row.id);
    setEditNote(row.note);
    setEditDue(isoToDatetimeLocalInput(row.due_at));
    setEditRec(row.recurrence);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditId(null);
    setEditNote("");
    setEditDue("");
    setEditRec("none");
  }, []);

  const saveEdit = useCallback(async () => {
    if (!ownerRef || editId == null) return;
    const note = editNote.trim();
    if (!note) return;
    setBusyId(editId);
    try {
      await updatePersonalTodo(editId, ownerRef, {
        note,
        dueAt: editDue || null,
        recurrence: editRec,
      });
      cancelEdit();
      await load();
      onChanged?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }, [ownerRef, editId, editNote, editDue, editRec, load, onChanged, cancelEdit]);

  const grouped = useMemo(() => {
    const withDue: PersonalTodo[] = [];
    const noDue: PersonalTodo[] = [];
    for (const t of items) {
      if (t.due_at) withDue.push(t);
      else noDue.push(t);
    }
    return { withDue, noDue };
  }, [items]);

  if (!owner) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200 max-w-2xl">
        <p className="font-medium">Не може да се определи акаунт за TO DO списък.</p>
        <p className="mt-2 opacity-90">
          Изход и нов вход обикновено решава проблема. (Ако сте админ, влезте отново с PIN, за да се
          запише профилът.)
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium text-[var(--color-text-bright)]">
            TO DO &mdash; {owner.displayName}
          </h1>
          <p className="mt-1 text-xs text-[var(--color-accent)]">
            Личен списък със задачи. Видим е само за този акаунт. Не е свързан с клиенти.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowDone((v) => !v)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--color-bg-card)] bg-[var(--color-bg-card)]/40 text-[var(--color-text)] hover:bg-[var(--color-bg-card)]/70"
        >
          {showDone ? "Скрий завършените" : "Покажи завършените"}
        </button>
      </div>

      <form
        onSubmit={handleAdd}
        className="conversation-panel rounded-lg p-3 space-y-2"
      >
        <textarea
          ref={noteRef}
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Нова задача (напр. да сменя акумулатора, да извикам куриер)…"
          rows={2}
          className="conversation-field w-full px-3 py-2 rounded-lg text-sm text-[var(--color-text)] placeholder:text-[var(--color-accent)] resize-y"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-[var(--color-accent)] flex items-center gap-2">
            <span>Падеж</span>
            <input
              type="datetime-local"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              className="conversation-field px-2 py-1.5 rounded-lg text-xs text-[var(--color-text)]"
            />
            {newDue && (
              <button
                type="button"
                onClick={() => setNewDue("")}
                className="text-[10px] uppercase tracking-wide text-[var(--color-accent)] hover:text-[var(--color-text-bright)]"
              >
                изчисти
              </button>
            )}
          </label>
          <label className="text-xs text-[var(--color-accent)] flex items-center gap-2">
            <span>Повторение</span>
            <select
              value={newRec}
              onChange={(e) => setNewRec(e.target.value as PersonalTodoRecurrence)}
              className="conversation-field px-2 py-1.5 rounded-lg text-xs text-[var(--color-text)]"
            >
              {RECURRENCE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {RECURRENCE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex-1" />
          <button
            type="submit"
            disabled={adding || !newNote.trim()}
            className="px-3 py-1.5 rounded-lg bg-emerald-600/30 text-emerald-100 text-xs font-medium border border-emerald-500/40 hover:bg-emerald-600/50 disabled:opacity-50"
          >
            {adding ? "…" : "Добави"}
          </button>
        </div>
        {newRec !== "none" && !newDue && (
          <p className="text-[11px] text-amber-300/80">
            Препоръка: за повтаряща се задача задайте падеж, иначе няма да се „търкаля“ напред.
          </p>
        )}
      </form>

      {loading ? (
        <div className="text-sm text-[var(--color-accent)]">Зареждане…</div>
      ) : err ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          <p className="font-medium">Грешка при зареждане на задачите.</p>
          <p className="mt-2 opacity-90">{err}</p>
          <p className="mt-2 text-xs text-[var(--color-accent)]">
            Ако таблицата липсва, пусни в Supabase:{" "}
            <code className="text-[var(--color-text-bright)]">031_personal_todos.sql</code>
          </p>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--color-accent)]">
          {showDone ? "Няма задачи." : "Няма активни задачи. Добави първата отгоре."}
        </p>
      ) : (
        <div className="space-y-5">
          {grouped.withDue.length > 0 && (
            <Section title="С падеж">
              {grouped.withDue.map((t) => (
                <TodoRow
                  key={t.id}
                  row={t}
                  busy={busyId === t.id}
                  editing={editId === t.id}
                  editNote={editNote}
                  editDue={editDue}
                  editRec={editRec}
                  onEditNote={setEditNote}
                  onEditDue={setEditDue}
                  onEditRec={setEditRec}
                  onStartEdit={() => startEdit(t)}
                  onCancelEdit={cancelEdit}
                  onSaveEdit={saveEdit}
                  onToggleDone={() => handleToggleDone(t.id)}
                  onDelete={() => handleDelete(t.id)}
                />
              ))}
            </Section>
          )}
          {grouped.noDue.length > 0 && (
            <Section title="Без падеж">
              {grouped.noDue.map((t) => (
                <TodoRow
                  key={t.id}
                  row={t}
                  busy={busyId === t.id}
                  editing={editId === t.id}
                  editNote={editNote}
                  editDue={editDue}
                  editRec={editRec}
                  onEditNote={setEditNote}
                  onEditDue={setEditDue}
                  onEditRec={setEditRec}
                  onStartEdit={() => startEdit(t)}
                  onCancelEdit={cancelEdit}
                  onSaveEdit={saveEdit}
                  onToggleDone={() => handleToggleDone(t.id)}
                  onDelete={() => handleDelete(t.id)}
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-[var(--color-text-bright)]">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

interface TodoRowProps {
  row: PersonalTodo;
  busy: boolean;
  editing: boolean;
  editNote: string;
  editDue: string;
  editRec: PersonalTodoRecurrence;
  onEditNote: (v: string) => void;
  onEditDue: (v: string) => void;
  onEditRec: (v: PersonalTodoRecurrence) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onToggleDone: () => void;
  onDelete: () => void;
}

function TodoRow(props: TodoRowProps) {
  const {
    row,
    busy,
    editing,
    editNote,
    editDue,
    editRec,
    onEditNote,
    onEditDue,
    onEditRec,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    onToggleDone,
    onDelete,
  } = props;

  const accent = dueAccentClasses(dueState(row.due_at));
  const isDone = row.done;

  return (
    <div
      className={`flex flex-wrap items-start gap-3 rounded-lg border p-3 text-sm ${accent} ${
        isDone ? "opacity-60" : ""
      }`}
    >
      <button
        type="button"
        onClick={onToggleDone}
        disabled={busy}
        title={isDone ? "Маркирай като активна" : "Маркирай като готова"}
        className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center text-[11px] font-bold ${
          isDone
            ? "bg-emerald-500/40 border-emerald-400 text-emerald-50"
            : "border-[var(--color-accent)] text-transparent hover:bg-[var(--color-accent)]/20"
        } disabled:opacity-50`}
      >
        {busy ? "…" : isDone ? "✓" : ""}
      </button>

      <div className="min-w-0 flex-1 space-y-1">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={editNote}
              onChange={(e) => onEditNote(e.target.value)}
              rows={2}
              className="conversation-field w-full px-3 py-2 rounded-lg text-sm text-[var(--color-text)] resize-y"
            />
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-[var(--color-accent)] flex items-center gap-2">
                <span>Падеж</span>
                <input
                  type="datetime-local"
                  value={editDue}
                  onChange={(e) => onEditDue(e.target.value)}
                  className="conversation-field px-2 py-1.5 rounded-lg text-xs text-[var(--color-text)]"
                />
                {editDue && (
                  <button
                    type="button"
                    onClick={() => onEditDue("")}
                    className="text-[10px] uppercase tracking-wide text-[var(--color-accent)] hover:text-[var(--color-text-bright)]"
                  >
                    изчисти
                  </button>
                )}
              </label>
              <label className="text-xs text-[var(--color-accent)] flex items-center gap-2">
                <span>Повторение</span>
                <select
                  value={editRec}
                  onChange={(e) => onEditRec(e.target.value as PersonalTodoRecurrence)}
                  className="conversation-field px-2 py-1.5 rounded-lg text-xs text-[var(--color-text)]"
                >
                  {RECURRENCE_ORDER.map((r) => (
                    <option key={r} value={r}>
                      {RECURRENCE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ) : (
          <>
            <p
              className={`whitespace-pre-wrap break-words text-[var(--color-text-bright)] ${
                isDone ? "line-through" : ""
              }`}
            >
              {row.note}
            </p>
            <div className="text-xs text-[var(--color-accent)] flex flex-wrap gap-x-3 gap-y-1">
              {row.due_at && (
                <span>
                  Падеж: <time dateTime={row.due_at}>{formatDateTime(row.due_at)}</time>
                </span>
              )}
              {row.recurrence !== "none" && <span>{RECURRENCE_LABELS[row.recurrence]}</span>}
              {isDone && row.done_at && (
                <span className="text-emerald-300/90">Готово {formatDateTime(row.done_at)}</span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {editing ? (
          <>
            <button
              type="button"
              disabled={busy || !editNote.trim()}
              onClick={onSaveEdit}
              className="px-3 py-1.5 rounded-lg bg-[var(--color-accent)]/30 text-[var(--color-text-bright)] text-xs font-medium border border-[var(--color-accent)]/50 hover:bg-[var(--color-accent)]/50 disabled:opacity-50"
            >
              {busy ? "…" : "Запази"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onCancelEdit}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--color-bg-card)] hover:bg-[var(--color-bg-card)]/50 disabled:opacity-50"
            >
              Отказ
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={onStartEdit}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--color-bg-card)] hover:bg-[var(--color-bg-card)]/50 disabled:opacity-50"
            >
              Редактирай
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-500/40 text-red-200 hover:bg-red-500/20 disabled:opacity-50"
            >
              Изтрий
            </button>
          </>
        )}
      </div>
    </div>
  );
}
