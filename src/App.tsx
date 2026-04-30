import { useState, useCallback, useEffect } from "react";
import { LoginView } from "./components/Auth/LoginView";
import { OrgAccessView } from "./components/Auth/OrgAccessView";
import { Layout } from "./components/Layout/Layout";
import { ClientsView } from "./components/Clients/ClientsView";
import { SuppliersView } from "./components/Suppliers/SuppliersView";
import { TransportView } from "./components/Transport/TransportView";
import { CompetitionView } from "./components/Competition/CompetitionView";
import { SearchResultsView } from "./components/Search/SearchResultsView";
import { StatisticsView } from "./components/Statistics/StatisticsView";
import { DayConversationsWindow } from "./components/Statistics/DayConversationsWindow";
import { SettingsView } from "./components/Settings/SettingsView";
import { RemindersView } from "./components/Reminders/RemindersView";
import { KsbRegisterView } from "./components/Ksb/KsbRegisterView";
import { TodoView } from "./components/Todo/TodoView";
import type { AppMainView } from "./components/Layout/Sidebar";
import { clearStoredRole, getStoredRole, setStoredRole, type LoginSuccessPayload } from "./lib/auth";
import { lookupCompanyByCode } from "./lib/companyAccess";
import {
  clearAdminActorProfile,
  clearCompanyContext,
  getCompanyId,
  getLastOrgCode,
  setAdminActorProfile,
  setCompanyContext,
  setStaffUserSession,
} from "./lib/session";
import { countPersonalTodosDueOrOverdue, countTodayPendingReminders, type SearchResult } from "./lib/db";
import { getCurrentTodoOwner } from "./lib/todoOwner";
import { checkForAppUpdate, type AppUpdateInfo } from "./lib/updater";
import { UpdateInProgressScreen } from "./components/Update/UpdateInProgressScreen";
import {
  emitOpenClient,
  onOpenClient,
  readStandaloneDayParam,
  readStandaloneWindowParam,
} from "./lib/multiWindow";
import { NavProvider, useNav } from "./lib/navHistory";

function App() {
  return (
    <NavProvider>
      <AppContent />
    </NavProvider>
  );
}

function AppContent() {
  const nav = useNav();
  const [appUpdate, setAppUpdate] = useState<"check" | "ok" | AppUpdateInfo>("check");
  const [boot, setBoot] = useState<"loading" | "needCode" | "ready">("loading");
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [authRole, setAuthRole] = useState(() => getStoredRole());
  const [currentView, setCurrentView] = useState<AppMainView>("clients");
  const [searchTarget, setSearchTarget] = useState<SearchResult | null>(null);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [reminderTodayCount, setReminderTodayCount] = useState(0);
  const [todoDueCount, setTodoDueCount] = useState(0);
  const standaloneWindow = readStandaloneWindowParam();
  const standaloneDay = readStandaloneDayParam();

  const refreshReminderCount = useCallback(() => {
    if (authRole == null) return;
    countTodayPendingReminders()
      .then(setReminderTodayCount)
      .catch(() => setReminderTodayCount(0));
  }, [authRole]);

  const refreshTodoCount = useCallback(() => {
    if (authRole == null) {
      setTodoDueCount(0);
      return;
    }
    const owner = getCurrentTodoOwner();
    if (!owner) {
      setTodoDueCount(0);
      return;
    }
    countPersonalTodosDueOrOverdue({ kind: owner.kind, key: owner.key })
      .then(setTodoDueCount)
      .catch(() => setTodoDueCount(0));
  }, [authRole]);

  useEffect(() => {
    let c = false;
    checkForAppUpdate()
      .then((i) => {
        if (c) return;
        if (i) setAppUpdate(i);
        else setAppUpdate("ok");
      })
      .catch(() => {
        if (!c) setAppUpdate("ok");
      });
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = getCompanyId();
      if (existing != null) {
        if (!cancelled) {
          setCompanyId(existing);
          setBoot("ready");
        }
        return;
      }
      const last = getLastOrgCode();
      if (last) {
        try {
          const row = await lookupCompanyByCode(last);
          if (row && !cancelled) {
            setCompanyContext(row.id, last);
            setCompanyId(row.id);
            setBoot("ready");
            return;
          }
        } catch {
          clearCompanyContext();
        }
      }
      if (!cancelled) setBoot("needCode");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      authRole === "clients" &&
      currentView !== "clients" &&
      currentView !== "statistics" &&
      currentView !== "reminders" &&
      currentView !== "ksb" &&
      currentView !== "split" &&
      currentView !== "todo"
    ) {
      setCurrentView("clients");
      setSearchTarget(null);
      setSearchQuery(null);
    }
    if (authRole === "clients" && currentView === "settings") {
      setCurrentView("clients");
      setSearchTarget(null);
      setSearchQuery(null);
    }
  }, [authRole, currentView]);

  useEffect(() => {
    if (authRole == null) return;
    refreshReminderCount();
    const t = window.setInterval(refreshReminderCount, 60_000);
    const onRem = () => refreshReminderCount();
    window.addEventListener("klienti-reminders-changed", onRem);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("klienti-reminders-changed", onRem);
    };
  }, [authRole, currentView, refreshReminderCount]);

  useEffect(() => {
    if (authRole == null) {
      setTodoDueCount(0);
      return;
    }
    refreshTodoCount();
    const t = window.setInterval(refreshTodoCount, 60_000);
    return () => {
      window.clearInterval(t);
    };
  }, [authRole, currentView, refreshTodoCount]);

  useEffect(() => {
    if (standaloneWindow != null) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    onOpenClient(({ id, label }) => {
      if (cancelled) return;
      setCurrentView((v) => (v === "split" ? v : "clients"));
      setSearchTarget({ type: "client", id, label });
      setSearchQuery(null);
    })
      .then((u) => {
        if (cancelled) {
          u();
          return;
        }
        unlisten = u;
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [standaloneWindow]);

  const handleLoginSuccess = useCallback((payload: LoginSuccessPayload) => {
    if (payload.role === "admin") {
      setStoredRole("admin", payload.rememberMe);
      setAdminActorProfile(payload.adminActor, payload.rememberMe);
      setAuthRole("admin");
    } else {
      clearAdminActorProfile();
      setStaffUserSession(payload.staffUserId, payload.staffUsername, payload.rememberMe);
      setStoredRole("clients", payload.rememberMe);
      setAuthRole("clients");
    }
    setCurrentView("clients");
    setSearchTarget(null);
    setSearchQuery(null);
  }, []);

  const handleLogout = useCallback(() => {
    nav.clear();
    clearStoredRole();
    setAuthRole(null);
    setCurrentView("clients");
    setSearchTarget(null);
    setSearchQuery(null);
  }, [nav]);

  const handleSearchSelect = useCallback(
    (result: SearchResult) => {
      if (authRole === "clients" && result.type !== "client") return;
      const viewMap: Record<SearchResult["type"], AppMainView> = {
        client: "clients",
        supplier: "suppliers",
        transport_supplier: "transport",
        competitor: "competition",
        supplier_product: "suppliers",
      };
      const prevView = currentView;
      const prevTarget = searchTarget;
      const prevQuery = searchQuery;
      nav.push({
        restore: () => {
          setCurrentView(prevView);
          setSearchTarget(prevTarget);
          setSearchQuery(prevQuery);
        },
      });
      setCurrentView((v) =>
        v === "split" && result.type === "client" ? "split" : viewMap[result.type]
      );
      setSearchTarget(result);
      setSearchQuery(null);
    },
    [authRole, currentView, searchTarget, searchQuery, nav]
  );

  const handleSearchEnter = useCallback(
    (query: string) => {
      const prevQuery = searchQuery;
      nav.push({
        restore: () => setSearchQuery(prevQuery),
      });
      setSearchQuery(query);
    },
    [searchQuery, nav]
  );

  const clearSearchTarget = useCallback(() => setSearchTarget(null), []);

  const handleBackToAccessCode = useCallback(() => {
    clearCompanyContext();
    setCompanyId(null);
    setBoot("needCode");
  }, []);

  const pushDrillDownToClient = useCallback(
    (clientId: number, label: string) => {
      const prevView = currentView;
      const prevTarget = searchTarget;
      const prevQuery = searchQuery;
      nav.push({
        restore: () => {
          setCurrentView(prevView);
          setSearchTarget(prevTarget);
          setSearchQuery(prevQuery);
        },
      });
      setCurrentView("clients");
      setSearchTarget({ type: "client", id: clientId, label });
      setSearchQuery(null);
    },
    [currentView, searchTarget, searchQuery, nav]
  );

  if (appUpdate === "check") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)] text-sm text-[var(--color-accent)]">
        Проверка за нова версия…
      </div>
    );
  }

  if (typeof appUpdate === "object") {
    return (
      <UpdateInProgressScreen
        info={appUpdate}
        onSkip={() => {
          setAppUpdate("ok");
        }}
      />
    );
  }

  if (boot === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)] text-sm text-[var(--color-accent)]">
        Зареждане…
      </div>
    );
  }

  if (boot === "needCode" || companyId == null) {
    if (standaloneWindow === "ksb") {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)] text-sm text-[var(--color-accent)] p-6 text-center">
          Не е намерен контекст на фирма.
          <br />
          Логнете се в главния прозорец и опитайте отново.
        </div>
      );
    }
    return (
      <OrgAccessView
        onResolved={(id) => {
          setCompanyId(id);
          setBoot("ready");
        }}
      />
    );
  }

  if (!authRole) {
    if (standaloneWindow === "ksb") {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)] text-sm text-[var(--color-accent)] p-6 text-center">
          Влезте в главния прозорец преди да използвате КСБ в отделен прозорец.
        </div>
      );
    }
    return (
      <LoginView
        companyId={companyId}
        onSuccess={handleLoginSuccess}
        onBackToAccessCode={handleBackToAccessCode}
      />
    );
  }

  if (standaloneWindow === "ksb") {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--color-bg-primary)]">
        <header className="h-12 flex items-center px-4 border-b border-[var(--color-bg-card)] bg-[var(--color-bg-secondary)] shrink-0">
          <h1 className="text-sm font-medium text-[var(--color-text-bright)] tracking-tight">
            КСБ — регистър
          </h1>
        </header>
        <main className="flex-1 overflow-auto p-4 min-h-0">
          <KsbRegisterView
            compact
            onOpenClient={(clientId, label) => {
              void emitOpenClient({ id: clientId, label });
            }}
          />
        </main>
      </div>
    );
  }

  if (standaloneWindow === "stats-conversations") {
    if (!standaloneDay) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)] text-sm text-[var(--color-accent)] p-6 text-center">
          Липсва валиден ден за прозореца с разговори.
        </div>
      );
    }
    return <DayConversationsWindow dayKey={standaloneDay} />;
  }

  return (
    <Layout
      role={authRole}
      onLogout={handleLogout}
      currentView={currentView}
      onViewChange={(v: AppMainView) => {
        nav.clear();
        setCurrentView(v);
        setSearchTarget(null);
        setSearchQuery(null);
      }}
      onSearchSelect={handleSearchSelect}
      onSearchEnter={handleSearchEnter}
      reminderTodayCount={reminderTodayCount}
      todoDueCount={todoDueCount}
      onMainRef={nav.registerScrollEl}
    >
      {searchQuery ? (
        <SearchResultsView
          query={searchQuery}
          onSelect={handleSearchSelect}
          onBack={() => {
            if (!nav.back()) setSearchQuery(null);
          }}
          clientsOnly={authRole === "clients"}
        />
      ) : (
        <>
          {currentView === "clients" && (
            <ClientsView
              role={authRole}
              initialSelectedId={searchTarget?.type === "client" ? searchTarget.id : undefined}
              onNavigated={clearSearchTarget}
            />
          )}
          {currentView === "suppliers" && (
            <SuppliersView
              initialSelectedId={
                searchTarget?.type === "supplier" || searchTarget?.type === "supplier_product" ? searchTarget.id : undefined
              }
              onNavigated={clearSearchTarget}
            />
          )}
          {currentView === "transport" && (
            <TransportView
              initialSelectedId={searchTarget?.type === "transport_supplier" ? searchTarget.id : undefined}
              onNavigated={clearSearchTarget}
            />
          )}
          {currentView === "competition" && (
            <CompetitionView
              initialSelectedId={searchTarget?.type === "competitor" ? searchTarget.id : undefined}
              onNavigated={clearSearchTarget}
            />
          )}
          {currentView === "reminders" && (
            <RemindersView
              onOpenClient={(clientId, label) => {
                pushDrillDownToClient(clientId, label);
                refreshReminderCount();
              }}
              onInvalidateTodayCount={refreshReminderCount}
            />
          )}
          {currentView === "ksb" && (
            <KsbRegisterView
              onOpenClient={(clientId, label) => {
                pushDrillDownToClient(clientId, label);
              }}
            />
          )}
          {currentView === "split" && (
            <div className="flex gap-3 h-full min-h-0">
              <div className="flex-1 min-w-0 overflow-auto pr-1">
                <ClientsView
                  role={authRole}
                  initialSelectedId={
                    searchTarget?.type === "client" ? searchTarget.id : undefined
                  }
                  onNavigated={clearSearchTarget}
                />
              </div>
              <div className="w-px bg-[var(--color-bg-card)] shrink-0" />
              <div className="flex-1 min-w-0 overflow-auto pl-1">
                <KsbRegisterView
                  compact
                  onOpenClient={(clientId, label) => {
                    const prevTarget = searchTarget;
                    nav.push({
                      restore: () => setSearchTarget(prevTarget),
                    });
                    setSearchTarget({ type: "client", id: clientId, label });
                    setSearchQuery(null);
                  }}
                />
              </div>
            </div>
          )}
          {currentView === "statistics" && (
            <StatisticsView
              role={authRole}
              onOpenClient={(clientId, label) => {
                pushDrillDownToClient(clientId, label);
              }}
            />
          )}
          {currentView === "settings" && authRole === "admin" && <SettingsView />}
          {currentView === "todo" && <TodoView onChanged={refreshTodoCount} />}
        </>
      )}
    </Layout>
  );
}

export default App;
