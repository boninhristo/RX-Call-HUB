import { useEffect, useRef } from "react";
import { Header } from "./Header";
import { Sidebar, type AppMainView } from "./Sidebar";
import type { AppRole } from "../../lib/auth";
import type { SearchResult } from "../../lib/db";

interface LayoutProps {
  role: AppRole;
  onLogout: () => void;
  currentView: AppMainView;
  onViewChange: (view: AppMainView) => void;
  onSearchSelect?: (result: SearchResult) => void;
  onSearchEnter?: (query: string) => void;
  reminderTodayCount?: number;
  onMainRef?: (el: HTMLElement | null) => void;
  children: React.ReactNode;
}

export function Layout({
  role,
  onLogout,
  currentView,
  onViewChange,
  onSearchSelect,
  onSearchEnter,
  reminderTodayCount = 0,
  onMainRef,
  children,
}: LayoutProps) {
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onMainRef?.(mainRef.current);
    return () => {
      onMainRef?.(null);
    };
  }, [onMainRef]);

  return (
    <div className="h-screen flex flex-col bg-[var(--color-bg-primary)]">
      <Header role={role} onLogout={onLogout} onSearchSelect={onSearchSelect} onSearchEnter={onSearchEnter} />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <Sidebar
          role={role}
          currentView={currentView}
          onViewChange={onViewChange}
          reminderTodayCount={reminderTodayCount}
        />
        <main ref={mainRef} className="flex-1 overflow-auto p-4 min-h-0">{children}</main>
      </div>
    </div>
  );
}
