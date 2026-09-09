import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { logout, type AuthUser } from "../api/auth";
import { clearQueryBootstrapCache, fetchNavigation } from "../api/query";
import AppModuleNav from "../components/nav/AppModuleNav";
import AppPageNav from "../components/nav/AppPageNav";
import AppTabs, { reorderTabs, type AppTabItem } from "../components/nav/AppTabs";
import ErrorState from "../components/feedback/ErrorState";
import LoadingState from "../components/feedback/LoadingState";
import Logo from "../components/common/Logo";
import { findProtectedRoute } from "../router/protectedRoutes";
import type { QueryNavigationModule } from "../types/query";

interface AppShellProps {
  onLogout: (user: AuthUser | null) => void;
  user: AuthUser;
}

export default function AppShell({ onLogout, user }: AppShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [modules, setModules] = useState<QueryNavigationModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [tabs, setTabs] = useState<AppTabItem[]>([]);
  const [tabReloadKeys, setTabReloadKeys] = useState<Record<string, number>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const matchedNavigation = useMemo(() => {
    for (const module of modules) {
      const matchedEntry = module.entries.find((entry) => entry.href === location.pathname);
      if (matchedEntry) {
        return {
          module,
          entry: matchedEntry,
          label: matchedEntry.label,
        };
      }

      if (module.home_href === location.pathname) {
        return {
          module,
          entry: null,
          label: module.label,
        };
      }
    }

    return null;
  }, [location.pathname, modules]);

  useEffect(() => {
    let mounted = true;

    async function loadNavigation() {
      try {
        const payload = await fetchNavigation();
        if (!mounted) {
          return;
        }
        setModules(payload.modules.map(normalizeModuleHomeHref));
        setError("");
      } catch (caughtError) {
        if (!mounted) {
          return;
        }
        if (caughtError instanceof ApiError && caughtError.status === 401) {
          onLogout(null);
          navigate("/login", { replace: true });
          return;
        }
        setError(caughtError instanceof ApiError ? caughtError.message : "导航加载失败");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadNavigation();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (isLoading || error) {
      return;
    }

    const nextTab: AppTabItem = {
      href: location.pathname,
      label: matchedNavigation?.label ?? "当前页面",
    };

    setTabs((currentTabs) => {
      const existingIndex = currentTabs.findIndex((tab) => tab.href === nextTab.href);
      if (existingIndex >= 0) {
        return currentTabs.map((tab, index) => (index === existingIndex ? nextTab : tab));
      }
      return [...currentTabs, nextTab];
    });
  }, [error, isLoading, location.pathname, matchedNavigation]);

  useEffect(() => {
    const handleAccountSetActiveChanged = () => {
      setTabReloadKeys((current) => {
        const next = { ...current };
        tabs.forEach((tab) => {
          if (tab.href !== location.pathname) {
            next[tab.href] = (next[tab.href] ?? 0) + 1;
          }
        });
        return next;
      });
    };

    window.addEventListener("account-set-active-changed", handleAccountSetActiveChanged);
    return () => {
      window.removeEventListener("account-set-active-changed", handleAccountSetActiveChanged);
    };
  }, [tabs, location.pathname]);

  async function handleLogout() {
    await logout();
    clearQueryBootstrapCache();
    onLogout(null);
    navigate("/login", { replace: true });
  }

  function handleNavigateTab(href: string) {
    navigate(href);
  }

  function handleRefreshTab(href: string) {
    navigate(href, { replace: true });
    setTabReloadKeys((current) => ({
      ...current,
      [href]: (current[href] ?? 0) + 1,
    }));
  }

  function handleReorderTab(draggedHref: string, targetHref: string) {
    setTabs((currentTabs) => reorderTabs(currentTabs, draggedHref, targetHref));
  }

  function handleCloseTab(href: string) {
    if (tabs.length <= 1) {
      return;
    }

    const closingIndex = tabs.findIndex((tab) => tab.href === href);
    if (closingIndex < 0) {
      return;
    }

    const nextTabs = tabs.filter((tab) => tab.href !== href);
    const fallbackTab = nextTabs[closingIndex] ?? nextTabs[closingIndex - 1] ?? null;

    setTabs(nextTabs);
    setTabReloadKeys((currentKeys) => {
      const nextKeys = { ...currentKeys };
      delete nextKeys[href];
      return nextKeys;
    });

    if (href === location.pathname && fallbackTab) {
      navigate(fallbackTab.href);
    }
  }

  const currentModule = matchedNavigation?.module ?? modules[0] ?? null;
  const currentEntry = matchedNavigation?.entry ?? null;
  const roleLabel = user.role === "admin" ? "管理员" : "只读用户";

  return (
    <div className="app-layout app-shell-grid">
      <aside className={`app-sidebar${sidebarCollapsed ? " is-collapsed" : ""}`}>
        <div
          className="app-sidebar-brand"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: sidebarCollapsed ? "center" : "stretch",
            justifyContent: sidebarCollapsed ? "center" : "flex-start",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: sidebarCollapsed ? "center" : "flex-start",
              width: "100%",
            }}
          >
            <Logo
              size={sidebarCollapsed ? 28 : 26}
              variant={sidebarCollapsed ? "icon" : "full"}
              textColor="var(--ent-text, #183153)"
            />
          </div>
          {!sidebarCollapsed && <p>当前模块：{currentModule?.label ?? "系统导航"}</p>}
          {!sidebarCollapsed && <p>当前用户：{user.username}</p>}
        </div>
        {isLoading ? <div className="app-sidebar-hint">正在加载菜单...</div> : null}
        {error ? <div className="app-sidebar-error">{error}</div> : null}
        {!isLoading && !error ? (
          <>
            <AppModuleNav collapsed={sidebarCollapsed} currentModule={currentModule} modules={modules} />
            <AppPageNav
              collapsed={sidebarCollapsed}
              currentEntry={currentEntry}
              currentModule={currentModule}
              modules={modules}
            />
          </>
        ) : null}
        <button
          className="app-sidebar-toggle"
          onClick={() => setSidebarCollapsed((v) => !v)}
          style={{ marginTop: 0 }}
          title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          type="button"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {sidebarCollapsed
              ? <path d="M6 3l5 5-5 5" />
              : <path d="M10 3L5 8l5 5" />}
          </svg>
        </button>
      </aside>
      <div className="top-nav" style={{ display: "none" }} />
      <main className="app-main app-workspace app-workspace-frame">
        {!isLoading && !error ? (
          <AppTabs
            currentPath={location.pathname}
            onCloseTab={handleCloseTab}
            onNavigate={handleNavigateTab}
            onRefreshTab={handleRefreshTab}
            onReorderTab={handleReorderTab}
            tabs={tabs}
            extra={
              <div className="top-nav-actions" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="top-nav-user" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--ent-text-secondary)" }}>
                  <span className="top-nav-user-code" style={{ fontWeight: 600, color: "var(--ent-text)" }}>{user.username}</span>
                  <span style={{ opacity: 0.4 }}>|</span>
                  <span className="top-nav-user-role">{roleLabel}</span>
                </div>
                <button
                  className="top-nav-logout"
                  onClick={handleLogout}
                  style={{
                    minHeight: "28px",
                    height: "28px",
                    padding: "0 10px",
                    fontSize: "12px",
                    display: "inline-flex",
                    alignItems: "center",
                    cursor: "pointer",
                    border: "1px solid var(--ent-border-strong)",
                    borderRadius: "var(--ent-radius-sm)",
                    background: "#ffffff",
                    color: "var(--ent-text-secondary)",
                    fontWeight: 500
                  }}
                  type="button"
                >
                  退出登录
                </button>
              </div>
            }
          />
        ) : null}
        <div className="app-content">
          {isLoading ? <LoadingState message="正在准备导航..." /> : null}
          {error ? <ErrorState description={error} title="导航加载失败" /> : null}
          {!isLoading && !error
            ? tabs.map((tab) => {
                const route = findProtectedRoute(tab.href);
                if (!route) {
                  return null;
                }

                const isActive = tab.href === location.pathname;
                return (
                  <div
                    className={`app-tab-pane${isActive ? " is-active" : ""}`}
                    hidden={!isActive}
                    key={`${tab.href}:${tabReloadKeys[tab.href] ?? 0}`}
                  >
                    {route.element}
                  </div>
                );
              })
            : null}
        </div>
      </main>
    </div>
  );
}

function normalizeModuleHomeHref(module: QueryNavigationModule): QueryNavigationModule {
  const defaultEntryHref = module.entries[0]?.href;

  if (!defaultEntryHref || module.home_href === defaultEntryHref) {
    return module;
  }

  return {
    ...module,
    home_href: defaultEntryHref,
  };
}
