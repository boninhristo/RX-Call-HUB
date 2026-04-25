import { Fragment, useEffect, useMemo, useState } from "react";
import type { AppRole } from "../../lib/auth";
import {
  fetchStatisticsRows,
  listStaffUsers,
  type StatisticAggregatedRow,
  type StatisticsActorFilter,
  type StatisticsDayActorSummary,
  type StaffUser,
} from "../../lib/db";
import { formatDateTime } from "../../lib/format";
import { getStaffUserId } from "../../lib/session";

function formatDayHeading(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("bg-BG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Час:минута — денят е в заглавието на секцията; пълното време е в title/dateTime. */
function formatStatRowClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" });
}

/** Кратко обобщение за деня по автор (само ненулеви части). */
function formatActorDayStats(s: StatisticsDayActorSummary): string {
  const parts: string[] = [];
  if (s.newClients) parts.push(`${s.newClients} нови клиента`);
  if (s.contacts) parts.push(`${s.contacts} контакта`);
  if (s.conversations) parts.push(`${s.conversations} разговора`);
  if (s.meetings) parts.push(`${s.meetings} срещи`);
  if (s.orders) parts.push(`${s.orders} поръчки`);
  if (s.deletions) parts.push(`${s.deletions} изтривания`);
  return parts.length ? parts.join(", ") : "няма регистрирана активност";
}

interface StatisticsViewProps {
  onOpenClient?: (clientId: number, label: string) => void;
  role: AppRole;
}

export function StatisticsView({ onOpenClient, role }: StatisticsViewProps) {
  const [rows, setRows] = useState<StatisticAggregatedRow[]>([]);
  const [daySummaries, setDaySummaries] = useState<StatisticsDayActorSummary[]>([]);
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
    fetchStatisticsRows(statsFilter)
      .then((r) => {
        if (!cancelled) {
          setRows(r.rows);
          setDaySummaries(r.daySummaries);
        }
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

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    let r = rows;
    if (t) {
      r = r.filter((row) => {
        const blob = [
          row.clientName,
          row.company ?? "",
          row.searchText,
          ...row.actorLabels,
          row.clientCreated ? "създаден клиент нов" : "",
          ...row.orders.map((o) => `${o.description ?? ""} ${o.amount ?? ""}`),
          ...row.deletionLabels,
        ]
          .join(" ")
          .toLowerCase();
        return blob.includes(t);
      });
    }
    return [...r].sort((a, b) => {
      const dc = sortDate === "desc" ? b.dayKey.localeCompare(a.dayKey) : a.dayKey.localeCompare(b.dayKey);
      if (dc !== 0) return dc;
      const ta = new Date(a.lastOccurredAt).getTime();
      const tb = new Date(b.lastOccurredAt).getTime();
      if (tb !== ta) return tb - ta;
      return a.clientName.localeCompare(b.clientName, "bg");
    });
  }, [rows, search, sortDate]);

  const summariesByDay = useMemo(() => {
    const m = new Map<string, StatisticsDayActorSummary[]>();
    const cmp = sortDate === "desc" ? (a: string, b: string) => b.localeCompare(a) : (a: string, b: string) => a.localeCompare(b);
    const sorted = [...daySummaries].sort((x, y) => {
      const d = cmp(x.dayKey, y.dayKey);
      if (d !== 0) return d;
      return x.actorLabel.localeCompare(y.actorLabel, "bg");
    });
    for (const s of sorted) {
      if (!m.has(s.dayKey)) m.set(s.dayKey, []);
      m.get(s.dayKey)!.push(s);
    }
    return m;
  }, [daySummaries, sortDate]);

  if (loading) {
    return <div className="text-sm text-[var(--color-accent)]">Зареждане…</div>;
  }
  if (err) {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
        <p className="font-medium">Грешка при зареждане на статистиката.</p>
        <p className="mt-2 opacity-90">{err}</p>
        <p className="mt-3 text-xs text-[var(--color-accent)]">
          Ако пак има грешка след ъпдейт: провери мрежата и лимитите на проекта. При липсващи колони/типове в Supabase пусни последователно:{" "}
          <code className="text-[var(--color-text-bright)]">011_client_meetings_activity.sql</code>,{" "}
          <code className="text-[var(--color-text-bright)]">012_activity_metadata_and_fk.sql</code>,{" "}
          <code className="text-[var(--color-text-bright)]">013_client_meetings_location_contact.sql</code>,{" "}
          <code className="text-[var(--color-text-bright)]">014_client_activity_client_created.sql</code>,{" "}
          <code className="text-[var(--color-text-bright)]">015_staff_users.sql</code>,{" "}
          <code className="text-[var(--color-text-bright)]">016_client_activity_actor_user.sql</code>,{" "}
          <code className="text-[var(--color-text-bright)]">017_companies_multitenant.sql</code>
        </p>
      </div>
    );
  }

  const rowHasContent = (row: StatisticAggregatedRow) =>
    row.clientCreated ||
    row.hasContact ||
    row.conversationCount > 0 ||
    row.meetings.length > 0 ||
    row.orders.length > 0 ||
    row.deletionLabels.length > 0;

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-lg font-medium text-[var(--color-text-bright)]">Статистика</h1>
      <p className="text-xs text-[var(--color-accent)]">
        Под заглавието на всеки ден има кратко обобщение по автор: нови клиенти, контакти, разговори, срещи, поръчки, изтривания (от лога на активност). По-долу: по един ред на клиент за деня с детайли.
        Всеки ден показва само събитията от този ден; по-стари дни не се променят при нова активност.
        Предстоящите срещи са подчертани.
        {role === "admin" && (
          <span className="block mt-1 text-[var(--color-text-bright)]/90">
            Най-вляво на реда: малък box с инициали (напр. „АД“ за основен PIN, „КА“ за алтернативен админ), след това часът и клиентът. Пълното име е при посочване с мишката.
          </span>
        )}
        {role === "clients" && (
          <span className="block mt-1 text-[var(--color-text-bright)]/90">
            Виждате само действията, извършени с вашия служителски акаунт.
          </span>
        )}
      </p>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-[var(--color-accent)] mb-1">Търсене</label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Клиент, бележки от разговор/среща, поръчка…"
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-bg-card)] text-sm text-[var(--color-text)] placeholder:text-[var(--color-accent)]/50 focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        {role === "admin" && (
          <div>
            <label className="block text-xs text-[var(--color-accent)] mb-1">Филтър по автор</label>
            <select
              value={
                adminActorFilter === "all"
                  ? "all"
                  : adminActorFilter === "legacy"
                    ? "legacy"
                    : String(adminActorFilter)
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === "all") setAdminActorFilter("all");
                else if (v === "legacy") setAdminActorFilter("legacy");
                else setAdminActorFilter(parseInt(v, 10));
              }}
              className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
            >
              <option value="all">Всички</option>
              <option value="legacy">Само админ / без акаунт</option>
              {staffList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name ? `${u.display_name} (${u.username})` : u.username}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-[var(--color-accent)] mb-1">Подредба по дата</label>
          <select
            value={sortDate}
            onChange={(e) => setSortDate(e.target.value as "desc" | "asc")}
            className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] text-[var(--color-text)] text-sm"
          >
            <option value="desc">Най-новият ден отгоре</option>
            <option value="asc">Най-старият ден отгоре</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--color-accent)]">Няма записи за избраните критерии.</p>
      ) : (
        <div className="space-y-0.5">
          {filtered.map((row, i) => {
            const showDay = i === 0 || filtered[i - 1]!.dayKey !== row.dayKey;
            const clientLine = [row.clientName, row.company].filter(Boolean).join(" · ");
            return (
              <Fragment key={`${row.dayKey}-${row.clientId}-${i}`}>
                {showDay && (
                  <div
                    className={`pt-4 pb-1.5 border-t border-[var(--color-bg-card)] ${i === 0 ? "border-0 pt-0" : ""}`}
                  >
                    <h2 className="text-sm font-medium text-[var(--color-text-bright)] capitalize">
                      {formatDayHeading(row.dayKey)}
                    </h2>
                    {summariesByDay.get(row.dayKey)?.length ? (
                      <div className="mt-2 space-y-1.5 rounded-lg border border-[var(--color-bg-card)] bg-[var(--color-bg-secondary)]/80 px-3 py-2">
                        {summariesByDay.get(row.dayKey)!.map((s) => (
                          <div key={`${s.dayKey}-${s.actorKey}`} className="flex flex-wrap items-start gap-2 text-[11px] leading-snug text-[var(--color-text)]">
                            <span
                              className="inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded border border-[var(--color-bg-card)] bg-[var(--color-bg-card)]/60 px-1 text-[9px] font-semibold uppercase text-[var(--color-text-bright)]"
                              title={s.actorLabel}
                            >
                              {s.actorInitials}
                            </span>
                            <span>
                              <span className="font-medium text-[var(--color-text-bright)]">{s.actorLabel}</span>
                              {": "}
                              <span className="text-[var(--color-accent)]">{formatActorDayStats(s)}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
                <div
                  className="flex min-h-9 items-center gap-2 rounded-md border border-[var(--color-bg-card)] bg-[var(--color-bg-card)]/50 px-2 py-1.5 text-[11px] leading-snug"
                  title={`${formatDateTime(row.lastOccurredAt)} · ${clientLine}${
                    row.actorLabels.length > 0 ? ` · ${row.actorLabels.join(", ")}` : ""
                  }`}
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
                      title={`Последна промяна: ${formatDateTime(row.lastOccurredAt)}`}
                    >
                      {formatStatRowClock(row.lastOccurredAt)}
                    </time>
                    <span className="max-w-[min(180px,24vw)] truncate font-medium text-[var(--color-text-bright)]">
                      {clientLine}
                    </span>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-wrap content-center gap-x-1 gap-y-1">
                    {row.clientCreated && (
                      <span className="inline-flex shrink-0 items-center rounded border border-cyan-500/40 bg-cyan-500/20 px-1 py-0 text-[10px] text-cyan-200">
                        нов клиент
                      </span>
                    )}

                    {row.hasContact && (
                      <span
                        className="inline-flex shrink-0 items-center gap-0.5 rounded border border-emerald-500/40 bg-emerald-500/20 px-1 py-0 text-[10px] text-emerald-300"
                        title="Контакт"
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                        контакт
                      </span>
                    )}

                    {row.conversationCount > 0 && (
                      <span className="shrink-0 text-[10px] text-[var(--color-accent)]" title="Разговори">
                        разг. ×{row.conversationCount}
                      </span>
                    )}

                    {row.orders.length > 0 && (
                      <>
                        <span className="shrink-0 text-[10px] text-[var(--color-accent)]/80">поръч.:</span>
                        {row.orders.map((o, idx) => (
                          <span
                            key={idx}
                            className="max-w-[min(140px,40vw)] shrink truncate rounded border border-violet-500/30 bg-violet-500/15 px-1 py-0 text-[10px] text-violet-100"
                            title={[o.description, o.amount != null ? `${o.amount} €` : ""].filter(Boolean).join(" · ")}
                          >
                            {o.description ? o.description.slice(0, 48) + (o.description.length > 48 ? "…" : "") : "—"}
                            {o.amount != null && <span className="ml-0.5 font-medium">{o.amount}€</span>}
                          </span>
                        ))}
                      </>
                    )}

                    {row.meetings.length > 0 && (
                      <>
                        <span className="shrink-0 text-[10px] text-[var(--color-accent)]/80">срещи:</span>
                        {row.meetings.map((m) => (
                          <span
                            key={m.id}
                            className={
                              m.isUpcoming
                                ? "shrink-0 rounded border border-amber-400/50 bg-amber-500/25 px-1 py-0 text-[10px] text-amber-100"
                                : "shrink-0 rounded border border-[var(--color-bg-card)] bg-[var(--color-bg-secondary)] px-1 py-0 text-[10px] text-[var(--color-text)]/85"
                            }
                            title={m.isUpcoming ? "Предстояща" : "Минала"}
                          >
                            {formatDateTime(m.scheduledAt)}
                          </span>
                        ))}
                      </>
                    )}

                    {row.deletionLabels.length > 0 && (
                      <>
                        <span className="shrink-0 text-[9px] font-medium uppercase text-red-400/90">изтр.:</span>
                        {row.deletionLabels.map((d, idx) => (
                          <span
                            key={idx}
                            className="max-w-[min(160px,42vw)] shrink truncate rounded border border-red-500/25 bg-red-500/10 px-1 py-0 text-[10px] text-red-200/90"
                            title={d}
                          >
                            {d}
                          </span>
                        ))}
                      </>
                    )}

                    {!rowHasContent(row) && (
                      <span className="text-[10px] text-[var(--color-accent)]/50">—</span>
                    )}
                  </div>

                  {onOpenClient && row.clientExists && row.clientId > 0 && (
                    <button
                      type="button"
                      onClick={() => onOpenClient(row.clientId, row.clientName)}
                      title="Отвори картон"
                      className="shrink-0 rounded border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none text-[var(--color-text-bright)] hover:bg-[var(--color-accent)]/25"
                    >
                      Отвори
                    </button>
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
