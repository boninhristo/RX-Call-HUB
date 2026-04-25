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
import { SettingsView } from "./components/Settings/SettingsView";
import { RemindersView } from "./components/Reminders/RemindersView";
import { KsbRegisterView } from "./components/Ksb/KsbRegisterView";
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
import { countTodayPendingReminders, type SearchResult } from "./lib/db";
import { checkForAppUpdate, type AppUpdateInfo } from "./lib/updater";
import { UpdateInProgressScreen } from "./components/Update/UpdateInProgressScreen";

function App() {
  const [appUpdate, setAppUpdate] = useState<"check" | "ok" | AppUpdateInfo>("check");
  const [boot, setBoot] = useState<"loading" | "needCode" | "ready">("loading");
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [authRole, setAuthRole] = useState(() => getStoredRole());
  const [currentView, setCurrentView] = useState<AppMainView>("clients");
  const [searchTarget, setSearchTarget] = useState<SearchResult | null>(null);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [reminderTodayCount, setReminderTodayCount] = useState(0);

  const refreshReminderCount = useCallback(() => {
    if (authRole == null) return;
    countTodayPendingReminders()
      .then(setReminderTodayCount)
      .catch(() => setReminderTodayCount(0));
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
      currentView !== "ksb"
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
    clearStoredRole();
    setAuthRole(null);
    setCurrentView("clients");
    setSearchTarget(null);
    setSearchQuery(null);
  }, []);

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
      setCurrentView(viewMap[result.type]);
      setSearchTarget(result);
      setSearchQuery(null);
    },
    [authRole]
  );

  const handleSearchEnter = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const clearSearchTarget = useCallback(() => setSearchTarget(null), []);

  const handleBackToAccessCode = useCallback(() => {
    clearCompanyContext();
    setCompanyId(null);
    setBoot("needCode");
  }, []);

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
    return (
      <LoginView
        companyId={companyId}
        onSuccess={handleLoginSuccess}
        onBackToAccessCode={handleBackToAccessCode}
      />
    );
  }

  return (
    <Layout
      role={authRole}
      onLogout={handleLogout}
      currentView={currentView}
      onViewChange={(v: AppMainView) => {
        setCurrentView(v);
        setSearchTarget(null);
        setSearchQuery(null);
      }}
      onSearchSelect={handleSearchSelect}
      onSearchEnter={handleSearchEnter}
      reminderTodayCount={reminderTodayCount}
    >
      {searchQuery ? (
        <SearchResultsView
          query={searchQuery}
          onSelect={handleSearchSelect}
          onBack={() => setSearchQuery(null)}
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
                setCurrentView("clients");
                setSearchTarget({ type: "client", id: clientId, label });
                setSearchQuery(null);
                refreshReminderCount();
              }}
              onInvalidateTodayCount={refreshReminderCount}
            />
          )}
          {currentView === "ksb" && (
            <KsbRegisterView
              onOpenClient={(clientId, label) => {
                setCurrentView("clients");
                setSearchTarget({ type: "client", id: clientId, label });
                setSearchQuery(null);
              }}
            />
          )}
          {currentView === "statistics" && <StatisticsView role={authRole} onOpenClient={(clientId, label) => {
            setCurrentView("clients");
            setSearchTarget({ type: "client", id: clientId, label });
            setSearchQuery(null);
          }} />}
          {currentView === "settings" && authRole === "admin" && <SettingsView />}
        </>
      )}
    </Layout>
  );
}

export default App;
