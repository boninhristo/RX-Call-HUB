import { useCallback, useEffect, useState } from "react";
import {
  listConversationReminders,
  markConversationReminderDone,
  type ConversationReminder,
} from "../../lib/db";
import { formatDateTime } from "../../lib/format";

interface RemindersViewProps {
  onOpenClient?: (clientId: number, label: string) => void;
  onInvalidateTodayCount?: () => void;
}

function clientLabel(r: ConversationReminder): string {
  const n = r.clients?.name;
  if (n) return n;
  return `Клиент #${r.client_id}`;
}

function convSnippet(r: ConversationReminder): string {
  const notes = r.client_conversations?.notes?.trim();
  if (notes) return notes.length > 120 ? `${notes.slice(0, 120)}…` : notes;
  return "—";
}

export function RemindersView({ onOpenClient, onInvalidateTodayCount }: RemindersViewProps) {
  const [upcoming, setUpcoming] = useState<ConversationReminder[]>([]);
  const [past, setPast] = useState<ConversationReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { upcoming: u, past: p } = await listConversationReminders();
      setUpcoming(u);
      setPast(p);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDone = async (id: number) => {
    setBusyId(id);
    try {
      await markConversationReminderDone(id);
      await load();
      onInvalidateTodayCount?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="text-sm text-[var(--color-accent)]">Зареждане…</div>;
  }
  if (err) {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
        <p className="font-medium">Грешка при напомнянията.</p>
        <p className="mt-2 opacity-90">{err}</p>
        <p className="mt-2 text-xs text-[var(--color-accent)]">
          Ако таблицата липсва, пусни в Supabase: <code className="text-[var(--color-text-bright)]">028_conversation_reminders.sql</code>
        </p>
      </div>
    );
  }

  const renderRow = (r: ConversationReminder, showDone: boolean) => (
    <div
      key={r.id}
      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[var(--color-bg-card)] bg-[var(--color-bg-card)]/50 p-3 text-sm"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="font-medium text-[var(--color-text-bright)]">{clientLabel(r)}</div>
        <div className="text-xs text-[var(--color-accent)]">
          Напомняне: <time dateTime={r.remind_at}>{formatDateTime(r.remind_at)}</time>
          {r.done_at && (
            <>
              {" · "}
              <span className="text-emerald-400/90">готово {formatDateTime(r.done_at)}</span>
            </>
          )}
        </div>
        <p className="text-xs text-[var(--color-text)]/90 line-clamp-3">{convSnippet(r)}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {showDone && (
          <button
            type="button"
            disabled={busyId === r.id}
            onClick={() => void handleDone(r.id)}
            className="px-3 py-1.5 rounded-lg bg-emerald-600/30 text-emerald-200 text-xs font-medium border border-emerald-500/40 hover:bg-emerald-600/40 disabled:opacity-50"
          >
            {busyId === r.id ? "…" : "DONE"}
          </button>
        )}
        {onOpenClient && (
          <button
            type="button"
            onClick={() => onOpenClient(r.client_id, clientLabel(r))}
            className="px-3 py-1.5 rounded-lg bg-[var(--color-accent)]/20 text-[var(--color-text-bright)] text-xs font-medium border border-[var(--color-accent)]/40 hover:bg-[var(--color-accent)]/30"
          >
            Към клиент
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-lg font-medium text-[var(--color-text-bright)]">REMINDERS</h1>
        <p className="mt-1 text-xs text-[var(--color-accent)]">
          Предстоящи: незавършени напомняния от днес нататък (включително днешни след изтекъл час). Минали: завършени или пропуснати от предишни дни.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--color-text-bright)]">Предстоящи</h2>
        {upcoming.length === 0 ? (
          <p className="text-xs text-[var(--color-accent)]">Няма.</p>
        ) : (
          <div className="space-y-2">{upcoming.map((r) => renderRow(r, true))}</div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--color-text-bright)]">Минали</h2>
        {past.length === 0 ? (
          <p className="text-xs text-[var(--color-accent)]">Няма.</p>
        ) : (
          <div className="space-y-2">{past.map((r) => renderRow(r, r.done_at == null))}</div>
        )}
      </section>
    </div>
  );
}
