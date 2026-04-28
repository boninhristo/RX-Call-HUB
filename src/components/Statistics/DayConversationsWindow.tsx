import { useEffect, useMemo, useState } from "react";
import {
  fetchDayConversations,
  listStaffUsers,
  type DayConversationRow,
  type StaffUser,
  type StatisticsActorFilter,
} from "../../lib/db";
import { formatDateTime } from "../../lib/format";

function headingForDay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("bg-BG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type Props = {
  dayKey: string;
};

export function DayConversationsWindow({ dayKey }: Props) {
  const [rows, setRows] = useState<DayConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [actorFilter, setActorFilter] = useState<"all" | "legacy" | number>("all");

  useEffect(() => {
    listStaffUsers().then(setStaffList).catch(() => setStaffList([]));
  }, []);

  const statsFilter = useMemo((): StatisticsActorFilter => {
    if (actorFilter === "all") return { scope: "all" };
    if (actorFilter === "legacy") return { scope: "legacy" };
    return { scope: "staff", staffUserId: actorFilter };
  }, [actorFilter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetchDayConversations(dayKey, statsFilter)
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dayKey, statsFilter]);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-bg-primary)]">
      <header className="h-12 shrink-0 border-b border-[var(--color-bg-card)] bg-[var(--color-bg-secondary)] px-4 flex items-center justify-between">
        <h1 className="text-sm font-medium text-[var(--color-text-bright)]">
          Разговори за {headingForDay(dayKey)}
        </h1>
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--color-accent)]">Оператор</label>
          <select
            value={
              actorFilter === "all"
                ? "all"
                : actorFilter === "legacy"
                  ? "legacy"
                  : String(actorFilter)
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === "all") setActorFilter("all");
              else if (v === "legacy") setActorFilter("legacy");
              else setActorFilter(parseInt(v, 10));
            }}
            className="px-2 py-1 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-xs"
          >
            <option value="all">Всички</option>
            <option value="legacy">Админ / без акаунт</option>
            {staffList.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name ? `${u.display_name} (${u.username})` : u.username}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 min-h-0">
        {loading ? (
          <p className="text-sm text-[var(--color-accent)]">Зареждане…</p>
        ) : err ? (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {err}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--color-accent)]">Няма разговори за този ден.</p>
        ) : (
          <div className="space-y-2 max-w-5xl">
            {rows.map((r) => (
              <div
                key={`${r.id}-${r.occurredAt}`}
                className="rounded-lg border border-[var(--color-bg-card)] bg-[var(--color-bg-card)]/40 p-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded border border-[var(--color-bg-card)] bg-[var(--color-bg-card)]/60 px-1 text-[9px] font-semibold uppercase text-[var(--color-text-bright)]"
                    title={r.actorLabel}
                  >
                    {r.actorInitials}
                  </span>
                  <time className="text-[var(--color-accent)]">{formatDateTime(r.occurredAt)}</time>
                  <span className="font-medium text-[var(--color-text-bright)]">{r.clientName}</span>
                  {r.clientCompany && (
                    <span className="text-[var(--color-accent)]/90">· {r.clientCompany}</span>
                  )}
                  <span className="rounded border border-[var(--color-bg-card)] px-1.5 py-0.5 text-[10px] text-[var(--color-text)]/90">
                    {r.type}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--color-text)]">
                  {r.notes?.trim() || "—"}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
