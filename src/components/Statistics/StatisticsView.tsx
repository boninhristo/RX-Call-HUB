import { useEffect, useMemo, useState } from "react";
import type { AppRole } from "../../lib/auth";
import {
  fetchStatisticsDaySummaries,
  fetchStatisticsRowsForDay,
  listStaffUsers,
  type StatisticAggregatedRow,
  type StatisticsActorFilter,
  type StatisticsDayActorSummary,
  type StaffUser,
} from "../../lib/db";
import { formatDateTime } from "../../lib/format";
import { getStaffUserId } from "../../lib/session";
import { openDayConversationsWindow } from "../../lib/multiWindow";

function formatDayHeading(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("bg-BG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatStatRowClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" });
}

function formatActorDayStats(s: StatisticsDayActorSummary): string {
  const parts: string[] = [];
  if (s.newClients) parts.push(`${s.newClients} new clients`);
  if (s.contacts) parts.push(`${s.contacts} contacts`);
  if (s.conversations) parts.push(`${s.conversations} conversations`);
  if (s.meetings) parts.push(`${s.meetings} meetings`);
  if (s.orders) parts.push(`${s.orders} orders`);
  if (s.deletions) parts.push(`${s.deletions} deletions`);
  return parts.length ? parts.join(", ") : "no activity";
}

const dayKeyToday = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

interface StatisticsViewProps {
  onOpenClient?: (clientId: number, label: string) => void;
  role: AppRole;
}

export function StatisticsView({ onOpenClient, role }: StatisticsViewProps) {
  const [daySummaries, setDaySummaries] = useState<StatisticsDayActorSummary[]>([]);
  const [dayKeys, setDayKeys] = useState<string[]>([]);
  const [rowsByDay, setRowsByDay] = useState<Record<string, StatisticAggregatedRow[]>>({});
  const [loadingDays, setLoadingDays] = useState<Record<string, boolean>>({});
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set([dayKeyToday()]));
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortDate, setSortDate] = useState<"desc" | "asc">("desc");
  const [adminActorFilter, setAdminActorFilter] = useState<"all" | "legacy" | number>("all");
  const [staffList, setStaffList] = useState<StaffUser[]>([]);

  useEffect(() => {
    if (role === "admin") {
      listStaffUsers().then(setStaffList).catch(() => setStaffList([]));
    }
  }, [role]);

  const statsFilter = useMemo((): StatisticsActorFilter | undefined => {
    if (role === "clients") {
      const sid = getStaffUserId();
      if (sid != null) return { scope: "staff", staffUserId: sid };
    }
    if (role === "admin") {
      if (adminActorFilter === "all") return { scope: "all" };
      if (adminActorFilter === "legacy") return { scope: "legacy" };
      return { scope: "staff", staffUserId: adminActorFilter as number };
    }
    return { scope: "all" };
  }, [role, adminActorFilter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setRowsByDay({});
    fetchStatisticsDaySummaries(statsFilter)
      .then((r) => {
        if (cancelled) return;
        setDaySummaries(r.daySummaries);
        setDayKeys(r.dayKeys);
        const today = dayKeyToday();
        if (r.dayKeys.includes(today)) setExpandedDays(new Set([today]));
        else setExpandedDays(new Set(r.dayKeys.slice(0, 1)));
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
  }, [statsFilter]);

  const summariesByDay = useMemo(() => {
    const m = new Map<string, StatisticsDayActorSummary[]>();
    const sorted = [...daySummaries].sort((x, y) => {
      const d = sortDate === "desc" ? y.dayKey.localeCompare(x.dayKey) : x.dayKey.localeCompare(y.dayKey);
      if (d !== 0) return d;
      return x.actorLabel.localeCompare(y.actorLabel, "bg");
    });
    for (const s of sorted) {
      if (!m.has(s.dayKey)) m.set(s.dayKey, []);
      m.get(s.dayKey)!.push(s);
    }
    return m;
  }, [daySummaries, sortDate]);

  const sortedDayKeys = useMemo(() => {
    const uniq = [...new Set(dayKeys)];
    return uniq.sort((a, b) => (sortDate === "desc" ? b.localeCompare(a) : a.localeCompare(b)));
  }, [dayKeys, sortDate]);

  const ensureDayRowsLoaded = async (dayKey: string) => {
    if (rowsByDay[dayKey] || loadingDays[dayKey]) return;
    setLoadingDays((p) => ({ ...p, [dayKey]: true }));
    try {
      const rows = await fetchStatisticsRowsForDay(dayKey, statsFilter);
      setRowsByDay((p) => ({ ...p, [dayKey]: rows }));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoadingDays((p) => ({ ...p, [dayKey]: false }));
    }
  };

  useEffect(() => {
    const today = dayKeyToday();
    if (expandedDays.has(today)) void ensureDayRowsLoaded(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedDays, statsFilter]);

  const rowHasContent = (row: StatisticAggregatedRow) =>
    row.clientCreated || row.hasContact || row.conversationCount > 0 || row.meetings.length > 0 || row.orders.length > 0 || row.deletionLabels.length > 0;

  if (loading) return <div className="text-sm text-[var(--color-accent)]">Loading...</div>;
  if (err) {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
        <p className="font-medium">Error while loading statistics.</p>
        <p className="mt-2 opacity-90">{err}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-lg font-medium text-[var(--color-text-bright)]">Statistics</h1>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-[var(--color-accent)] mb-1">Search (in loaded days)</label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Client, notes, meetings, orders..."
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-sm text-[var(--color-text)] placeholder:text-[var(--color-accent)]/50 focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>

        {role === "admin" && (
          <div>
            <label className="block text-xs text-[var(--color-accent)] mb-1">Actor filter</label>
            <select
              value={adminActorFilter === "all" ? "all" : adminActorFilter === "legacy" ? "legacy" : String(adminActorFilter)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "all") setAdminActorFilter("all");
                else if (v === "legacy") setAdminActorFilter("legacy");
                else setAdminActorFilter(parseInt(v, 10));
              }}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
            >
              <option value="all">All</option>
              <option value="legacy">Admin / no account</option>
              {staffList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name ? `${u.display_name} (${u.username})` : u.username}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs text-[var(--color-accent)] mb-1">Date sort</label>
          <select
            value={sortDate}
            onChange={(e) => setSortDate(e.target.value as "desc" | "asc")}
            className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>
      </div>

      {sortedDayKeys.length === 0 ? (
        <p className="text-sm text-[var(--color-accent)]">No records found.</p>
      ) : (
        <div className="space-y-3">
          {sortedDayKeys.map((dayKey) => {
            const summaries = summariesByDay.get(dayKey) ?? [];
            const isToday = dayKey === dayKeyToday();
            const expanded = expandedDays.has(dayKey);
            const dayRows = rowsByDay[dayKey] ?? [];
            const term = search.trim().toLowerCase();
            const filteredRows = term.length === 0 ? dayRows : dayRows.filter((row) => {
              const blob = [row.clientName, row.company ?? "", row.searchText, ...row.actorLabels, row.clientCreated ? "new client" : "", ...row.orders.map((o) => `${o.description ?? ""} ${o.amount ?? ""}`), ...row.deletionLabels].join(" ").toLowerCase();
              return blob.includes(term);
            });

            return (
              <div key={dayKey} className="rounded-lg border border-[var(--color-bg-card)] bg-[var(--color-bg-secondary)]/30">
                <div className="px-3 py-2 border-b border-[var(--color-bg-card)]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedDays((prev) => {
                          const next = new Set(prev);
                          if (next.has(dayKey)) next.delete(dayKey);
                          else {
                            next.add(dayKey);
                            void ensureDayRowsLoaded(dayKey);
                          }
                          return next;
                        });
                      }}
                      className="text-sm font-medium text-[var(--color-text-bright)] capitalize hover:text-[var(--color-accent)]"
                    >
                      {expanded ? "v" : ">"} {formatDayHeading(dayKey)} {isToday ? "(today)" : ""}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void openDayConversationsWindow(dayKey).catch((e) => alert(String(e)));
                      }}
                      className="rounded border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/15 px-2 py-1 text-[10px] font-semibold uppercase text-[var(--color-text-bright)] hover:bg-[var(--color-accent)]/25"
                    >
                      SEE ALL CONVERSATIONS
                    </button>
                  </div>

                  {summaries.length > 0 && (
                    <div className="mt-2 space-y-1 rounded-lg border border-[var(--color-bg-card)] bg-[var(--color-bg-secondary)]/70 px-2 py-2">
                      {summaries.map((s) => (
                        <div key={`${s.dayKey}-${s.actorKey}`} className="flex flex-wrap items-start gap-2 text-[11px] leading-snug text-[var(--color-text)]">
                          <span
                            className="inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded border border-[var(--color-bg-card)] bg-[var(--color-bg-card)]/60 px-1 text-[9px] font-semibold uppercase text-[var(--color-text-bright)]"
                            title={s.actorLabel}
                          >
                            {s.actorInitials}
                          </span>
                          <span>
                            <span className="font-medium text-[var(--color-text-bright)]">{s.actorLabel}</span>: <span className="text-[var(--color-accent)]">{formatActorDayStats(s)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {expanded && (
                  <div className="p-2 space-y-1.5">
                    {loadingDays[dayKey] ? (
                      <p className="text-xs text-[var(--color-accent)] px-1 py-2">Loading day data...</p>
                    ) : filteredRows.length === 0 ? (
                      <p className="text-xs text-[var(--color-accent)] px-1 py-2">No records for this day{term ? " (after filter)" : ""}.</p>
                    ) : (
                      filteredRows.map((row, i) => {
                        const clientLine = [row.clientName, row.company].filter(Boolean).join(" - ");
                        return (
                          <div
                            key={`${row.dayKey}-${row.clientId}-${i}`}
                            className="flex min-h-9 items-center gap-2 rounded-md border border-[var(--color-bg-card)] bg-[var(--color-bg-card)]/50 px-2 py-1.5 text-[11px] leading-snug"
                            title={`${formatDateTime(row.lastOccurredAt)} - ${clientLine}${row.actorLabels.length > 0 ? ` - ${row.actorLabels.join(", ")}` : ""}`}
                          >
                            {row.actorInitials.length > 0 && (
                              <div className="flex shrink-0 flex-wrap items-center gap-1">
                                {row.actorInitials.map((ini, idx) => (
                                  <span
                                    key={`${row.dayKey}-${row.clientId}-actor-${idx}`}
                                    title={row.actorLabels[idx] ?? ini}
                                    className="inline-flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded-md border border-[var(--color-bg-card)] bg-[var(--color-bg-card)]/50 px-1 text-[10px] font-semibold uppercase leading-none tracking-tight text-[var(--color-text-bright)]"
                                  >
                                    {ini}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                              <time
                                dateTime={row.lastOccurredAt}
                                className="w-14 shrink-0 text-center font-mono text-[10px] tabular-nums text-[var(--color-accent)]"
                                title={`Last update: ${formatDateTime(row.lastOccurredAt)}`}
                              >
                                {formatStatRowClock(row.lastOccurredAt)}
                              </time>
                              <span className="max-w-[min(180px,24vw)] truncate font-medium text-[var(--color-text-bright)]">{clientLine}</span>
                            </div>

                            <div className="flex min-w-0 flex-1 flex-wrap content-center gap-x-1 gap-y-1">
                              {row.clientCreated && <span className="inline-flex shrink-0 items-center rounded border border-cyan-500/40 bg-cyan-500/20 px-1 py-0 text-[10px] text-cyan-200">new client</span>}
                              {row.hasContact && (
                                <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-emerald-500/40 bg-emerald-500/20 px-1 py-0 text-[10px] text-emerald-300" title="Contact">
                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                                  contact
                                </span>
                              )}
                              {row.conversationCount > 0 && <span className="shrink-0 text-[10px] text-[var(--color-accent)]">conv. x{row.conversationCount}</span>}
                              {row.orders.length > 0 && row.orders.map((o, idx) => (
                                <span key={idx} className="max-w-[min(140px,40vw)] shrink truncate rounded border border-violet-500/30 bg-violet-500/15 px-1 py-0 text-[10px] text-violet-100" title={[o.description, o.amount != null ? `${o.amount} EUR` : ""].filter(Boolean).join(" - ")}>
                                  {o.description ? o.description.slice(0, 48) + (o.description.length > 48 ? "..." : "") : "-"}
                                  {o.amount != null && <span className="ml-0.5 font-medium">{o.amount} EUR</span>}
                                </span>
                              ))}
                              {row.meetings.map((m) => (
                                <span
                                  key={m.id}
                                  className={m.isUpcoming ? "shrink-0 rounded border border-amber-400/50 bg-amber-500/25 px-1 py-0 text-[10px] text-amber-100" : "shrink-0 rounded border border-[var(--color-bg-card)] bg-[var(--color-bg-secondary)] px-1 py-0 text-[10px] text-[var(--color-text)]/85"}
                                >
                                  {formatDateTime(m.scheduledAt)}
                                </span>
                              ))}
                              {!rowHasContent(row) && <span className="text-[10px] text-[var(--color-accent)]/50">-</span>}
                            </div>

                            {onOpenClient && row.clientExists && row.clientId > 0 && (
                              <button
                                type="button"
                                onClick={() => onOpenClient(row.clientId, row.clientName)}
                                className="shrink-0 rounded border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none text-[var(--color-text-bright)] hover:bg-[var(--color-accent)]/25"
                              >
                                Open
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
