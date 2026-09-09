import { useEffect, useState } from "react";
import { useNotification } from "../../components/feedback/Notification";

import { fetchDisabledUsers, unlockDisabledUser } from "../../api/admin";
import type { AdminDisabledUser } from "../../types/admin";
import ErrorState from "../../components/feedback/ErrorState";
import LoadingState from "../../components/feedback/LoadingState";
import QueryResultPanel from "../../components/query/QueryResultPanel";
import QueryTable from "../../components/query/QueryTable";

export default function DisabledUsersPage() {
  const notification = useNotification();
  const [users, setUsers] = useState<AdminDisabledUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [workingUserId, setWorkingUserId] = useState<number | null>(null);

  useEffect(() => {
    void loadUsers();
  }, []);

  async function loadUsers() {
    setIsLoading(true);
    setLoadError("");
    try {
      setUsers(await fetchDisabledUsers());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "禁用用户页面加载失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUnlock(user: AdminDisabledUser) {
    setWorkingUserId(user.id);
    try {
      await unlockDisabledUser(user.id);
      notification.success(`已解锁账号：${user.username}`);
      await loadUsers();
    } catch (error) {
      notification.error(error instanceof Error ? error.message : "解锁失败");
    } finally {
      setWorkingUserId(null);
    }
  }

  if (isLoading) {
    return <LoadingState message="正在准备禁用用户页面..." variant="table" />;
  }

  if (loadError) {
    return <ErrorState title="禁用用户页面加载失败" description={loadError} />;
  }

  const disabledUserTableHeaders = [
    "用户名",
    "姓名",
    "工号",
    "累计错误次数",
    "禁用状态",
    { label: "操作", sortable: false as const },
  ];

  const disabledUserTableRows = users.map((user) => [
    user.username,
    user.profile_name || "-",
    user.profile_emp_no || "-",
    user.login_failed_attempts,
    formatLoginStatus(user),
    <button
      className="account-action-button account-action-button--primary"
      disabled={workingUserId === user.id}
      onClick={() => void handleUnlock(user)}
      type="button"
      key={user.id}
    >
      {workingUserId === user.id ? "解锁中..." : "解锁"}
    </button>,
  ]);

  const disabledUserTableSortRows = users.map((user) => [
    user.username,
    user.profile_name || "-",
    user.profile_emp_no || "-",
    user.login_failed_attempts,
    formatLoginStatus(user),
    "",
  ]);

  return (
    <main className="account-center-page">
      <section className="account-page-stack">
        <div className="account-card-header master-list-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 4px", borderBottom: "none", background: "transparent", flexWrap: "wrap", gap: "12px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: "600", color: "var(--ent-text)", margin: 0 }}>禁用用户</h2>
          <div className="toolbar" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <button className="account-action-button" onClick={() => void loadUsers()} type="button">
              刷新
            </button>
          </div>
        </div>



        <QueryResultPanel>
          <QueryTable
            emptyText="当前没有被禁用登录的用户"
            headers={disabledUserTableHeaders}
            rows={disabledUserTableRows}
            sortRows={disabledUserTableSortRows}
          />
        </QueryResultPanel>
      </section>
    </main>
  );
}

function formatLoginStatus(user: AdminDisabledUser): string {
  if (user.login_disabled_until_admin_unlock) {
    return "已永久禁用，需管理员解锁";
  }
  if (user.login_locked_until) {
    return `临时禁用至 ${formatTime(user.login_locked_until)}`;
  }
  return "正常";
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
