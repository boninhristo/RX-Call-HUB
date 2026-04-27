import type { AppRole } from "../../lib/auth";

type MainView = "clients" | "suppliers" | "transport" | "competition" | "reminders" | "ksb" | "split";

export type AppMainView = MainView | "statistics" | "settings";

interface SidebarProps {
  currentView: AppMainView;
  onViewChange: (view: AppMainView) => void;
  role: AppRole;
  /** Незавършени напомняния за локалния днес (брояч върху REMINDERS). */
  reminderTodayCount?: number;
}

const mainNav: { id: Exclude<MainView, "reminders">; label: string }[] = [
  { id: "clients", label: "Clients" },
  { id: "suppliers", label: "Suppliers" },
  { id: "transport", label: "Transport" },
  { id: "competition", label: "Competition" },
];

export function Sidebar({ currentView, onViewChange, role, reminderTodayCount = 0 }: SidebarProps) {
  const items: { id: MainView; label: string }[] =
    role === "clients"
      ? [
          { id: "clients", label: "Clients" },
          { id: "reminders", label: "REMINDERS" },
          { id: "ksb", label: "КСБ" },
          { id: "split", label: "CLIENTS + КСБ" },
        ]
      : [
          ...mainNav,
          { id: "reminders", label: "REMINDERS" },
          { id: "ksb", label: "КСБ" },
          { id: "split", label: "CLIENTS + КСБ" },
        ];

  return (
    <aside className="w-48 flex-shrink-0 bg-[var(--color-bg-secondary)] border-r border-[var(--color-bg-card)] p-3 flex flex-col h-full min-h-0">
      <nav className="flex-1 space-y-0.5 min-h-0 overflow-y-auto">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`relative w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              currentView === item.id
                ? "bg-[var(--color-bg-card)] text-[var(--color-text-bright)]"
                : "text-[var(--color-accent)] hover:bg-[var(--color-bg-card)]/50 hover:text-[var(--color-text)]"
            }`}
          >
            <span className="inline-flex items-center gap-2 pr-6">
              {item.label}
              {item.id === "reminders" && reminderTodayCount > 0 && (
                <span
                  className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-amber-500/90 text-[10px] font-bold text-[var(--color-bg-primary)] tabular-nums"
                  title={`Напомняния за днес (незавършени): ${reminderTodayCount}`}
                >
                  {reminderTodayCount > 99 ? "99+" : reminderTodayCount}
                </span>
              )}
            </span>
          </button>
        ))}
      </nav>
      <div className="mt-auto pt-3 border-t border-[var(--color-bg-card)] shrink-0 space-y-0.5">
        {role === "admin" && (
          <button
            type="button"
            onClick={() => onViewChange("settings")}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              currentView === "settings"
                ? "bg-[var(--color-bg-card)] text-[var(--color-text-bright)]"
                : "text-[var(--color-accent)] hover:bg-[var(--color-bg-card)]/50 hover:text-[var(--color-text)]"
            }`}
          >
            Настройки
          </button>
        )}
        <button
          type="button"
          onClick={() => onViewChange("statistics")}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
            currentView === "statistics"
              ? "bg-[var(--color-bg-card)] text-[var(--color-text-bright)]"
              : "text-[var(--color-accent)] hover:bg-[var(--color-bg-card)]/50 hover:text-[var(--color-text)]"
          }`}
        >
          СТАТИСТИКА
        </button>
      </div>
    </aside>
  );
}
