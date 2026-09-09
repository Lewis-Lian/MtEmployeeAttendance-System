import { useEffect, useState } from "react";

import {
  getDatabaseSettings,
  saveDatabaseSettings,
  testDatabaseConnection,
  migrateDatabase,
  migrateToSqliteDatabase,
  switchToSqlite,
  switchToMysql,
  type DatabaseSettings,
} from "../../api/admin";
import ErrorState from "../../components/feedback/ErrorState";
import LoadingState from "../../components/feedback/LoadingState";
import QueryTable from "../../components/query/QueryTable";
import { useNotification } from "../../components/feedback/Notification";
import { useConfirm } from "../../components/feedback/ConfirmDialog";
import { Link } from "react-router-dom";

export default function DatabaseSettingsPage() {
  const notification = useNotification();
  const confirm = useConfirm();
  const [settings, setSettings] = useState<DatabaseSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [setupPassword, setSetupPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [unlockError, setUnlockError] = useState("");

  // MySQL 表单
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("3306");
  const [username, setUsername] = useState("root");
  const [password, setPassword] = useState("");
  const [database, setDatabase] = useState("");

  // 操作状态
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationResults, setMigrationResults] = useState<Array<{ table: string; rows: number; status: string }> | null>(null);

  async function handleUnlock() {
    if (!setupPassword) {
      setUnlockError("请输入密码");
      return;
    }
    setLoading(true);
    setUnlockError("");
    try {
      const data = await getDatabaseSettings(setupPassword);
      setSettings(data);
      const cfg = data.mysql_config || {};
      if (cfg.host) setHost(cfg.host);
      if (cfg.port) setPort(String(cfg.port));
      if (cfg.username) setUsername(cfg.username);
      if (cfg.password) setPassword(cfg.password);
      if (cfg.database) setDatabase(cfg.database);
      
      setUnlocked(true);
      setLoadError("");
    } catch (err: any) {
      if (err.status === 401 || err.status === 403) {
        setUnlockError(err.message || "密码错误");
        setUnlocked(false);
      } else {
        setLoadError(err instanceof Error ? err.message : "加载失败");
        setUnlocked(true);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // 部署密码仅保留在会话内存中，刷新页面需重新输入
    setLoading(false);
  }, []);

  function handleApiError(err: any, defaultMsg: string) {
    if (err.status === 401 || err.status === 403) {
      setUnlocked(false);
      notification.error("访问凭证已过期，请重新解锁");
    } else {
      notification.error(err instanceof Error ? err.message : defaultMsg);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await testDatabaseConnection({ host, port: Number(port), username, password, database }, setupPassword);
      if (res.ok) {
        notification.success("连接测试成功");
      } else {
        notification.error(res.message || "连接失败");
      }
    } catch (err: any) {
      handleApiError(err, "连接测试失败");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await saveDatabaseSettings({ host, port: Number(port), username, password, database }, setupPassword);
      notification.success(res.message || "暂存成功");
    } catch (err: any) {
      handleApiError(err, "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleMigrate() {
    const isConfirmed = await confirm({
      message: "确定要将 SQLite 数据迁移到 MySQL 吗？请确保 MySQL 数据库为空且暂存配置已保存。",
      type: "danger",
    });
    if (!isConfirmed) return;
    setMigrating(true);
    setMigrationResults(null);
    try {
      const res = await migrateDatabase(setupPassword);
      if (res.ok && res.results) {
        setMigrationResults(res.results);
        notification.success(`迁移完成，共 ${res.results.filter((r: any) => r.status === "ok").length} 张表`);
      } else {
        notification.error(res.message || "迁移失败");
      }
    } catch (err: any) {
      handleApiError(err, "迁移失败");
    } finally {
      setMigrating(false);
    }
  }

  async function handleMigrateToSqlite() {
    const isConfirmed = await confirm({
      message: "确定要将 MySQL 数据全量迁移回 SQLite 吗？这将覆盖现有的 SQLite 数据库。请确保 MySQL 来源配置有效。",
      type: "danger",
    });
    if (!isConfirmed) return;
    setMigrating(true);
    setMigrationResults(null);
    try {
      const res = await migrateToSqliteDatabase(setupPassword);
      if (res.ok && res.results) {
        setMigrationResults(res.results);
        notification.success(`反向迁移完成，共 ${res.results.filter((r: any) => r.status === "ok").length} 张表`);
      } else {
        notification.error(res.message || "反向迁移失败");
      }
    } catch (err: any) {
      handleApiError(err, "反向迁移失败");
    } finally {
      setMigrating(false);
    }
  }

  if (loading) return <LoadingState message="正在加载数据库设置..." variant="database-unlock" />;

  if (!unlocked) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div style={{ backgroundColor: "#fff", padding: "40px", borderRadius: "12px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)", width: "100%", maxWidth: 400 }}>
          <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 20 }}>安全解锁</h2>
          <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 24 }}>此系统部署页面已被保护。<br/>请输入 <b>SETUP_PASSWORD</b> 进行访问。</p>
          <input
            type="password"
            value={setupPassword}
            onChange={(e) => setSetupPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
            placeholder="请输入向导密码"
            style={{ ...inputStyle, width: "100%", marginBottom: 16, boxSizing: "border-box" }}
          />
          {unlockError && <p style={{ color: "#dc2626", fontSize: 14, marginBottom: 16, marginTop: -8 }}>{unlockError}</p>}
          <button onClick={handleUnlock} style={{ ...btnStyle, background: "#4f46e5", color: "#fff", width: "100%" }}>
            解锁并进入
          </button>
          
          <div style={{ marginTop: 24, textAlign: "center" }}>
            <Link to="/login" style={{ fontSize: 14, color: "#4f46e5", textDecoration: "none" }}>&larr; 返回普通登录页</Link>
          </div>
        </div>
      </div>
    );
  }

  if (loadError) return <ErrorState title="加载失败" description={loadError} />;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f3f4f6", padding: "40px 20px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto", position: "relative" }}>
        <button 
          onClick={() => {
            setSetupPassword("");
            setUnlocked(false);
          }}
          style={{ 
            position: "absolute", 
            top: 0, 
            right: 0, 
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#6b7280", 
            fontWeight: 500,
            fontSize: 14,
            padding: 0
          }}
        >
          重新锁定 🔒
        </button>
        <section className="legacy-page-section">
          <header className="legacy-page-header">
            <div className="legacy-page-heading">
              <h2 className="legacy-page-title" style={{ marginTop: 0 }}>系统部署向导：数据库设置</h2>
              <p className="legacy-page-description" style={{ color: "#059669", fontWeight: "bold" }}>页面已成功解锁。配置与迁移期间，请勿泄露访问凭证。</p>
            </div>
          </header>

      {/* 区域一：当前连接状态 */}
      <section className="legacy-surface admin-resource-panel" style={{ marginBottom: 24 }}>
        <div className="admin-resource-panel-head">
          <div>
            <p className="admin-resource-panel-kicker">当前连接</p>
            <p className="admin-resource-panel-title">当前数据库连接信息</p>
          </div>
        </div>
        {settings?.current && (
          <QueryTable
            headers={["配置项", "当前值", "说明"]}
            rows={settings.current.map((row) => [row.item, row.value, row.description])}
          />
        )}
      </section>

      {/* 区域二：MySQL 连接配置 */}
      <section className="legacy-surface admin-resource-panel" style={{ marginBottom: 24 }}>
        <div className="admin-resource-panel-head">
          <div>
            <p className="admin-resource-panel-kicker">MySQL 配置</p>
            <p className="admin-resource-panel-title">MySQL 连接信息</p>
            <p className="admin-resource-panel-description">填写 MySQL 连接信息后点击【暂存配置】。</p>
          </div>
        </div>
        <div style={{ padding: "16px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label className="admin-stack-sm">
            <span className="admin-text-sm">主机地址</span>
            <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="localhost" style={inputStyle} />
          </label>
          <label className="admin-stack-sm">
            <span className="admin-text-sm">端口</span>
            <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="3306" style={inputStyle} />
          </label>
          <label className="admin-stack-sm">
            <span className="admin-text-sm">用户名</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="root" style={inputStyle} />
          </label>
          <label className="admin-stack-sm">
            <span className="admin-text-sm">密码</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="数据库密码"
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
            <span className="admin-text-sm">数据库名</span>
            <input
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              placeholder="attendance_db"
              style={inputStyle}
            />
          </label>
        </div>
        <div style={{ padding: "0 24px 16px", display: "flex", gap: 8 }}>
          <button onClick={handleTest} disabled={testing} style={btnStyle}>
            {testing ? "测试中..." : "测试连接"}
          </button>
          <button onClick={handleSave} disabled={saving} style={{ ...btnStyle, background: "#f59e0b", color: "#fff" }}>
            {saving ? "暂存中..." : "暂存配置"}
          </button>
          <button
            onClick={async () => {
              if (!(await confirm({
                message: "确定要切换到刚才暂存的 MySQL 配置吗？重启应用后生效。",
                type: "warning",
              }))) return;
              try {
                const res = await switchToMysql(setupPassword);
                notification.success(res.message || "已切换到 MySQL");
              } catch (err: any) {
                handleApiError(err, "切换失败");
              }
            }}
            style={{ ...btnStyle, background: "#2563eb", color: "#fff" }}
          >
            切换到 MySQL
          </button>
          <button
            onClick={async () => {
              if (!(await confirm({
                message: "确定要切回 SQLite 吗？系统连接将重置。重启应用后生效。",
                type: "warning",
              }))) return;
              try {
                const res = await switchToSqlite(setupPassword);
                notification.success(res.message || "已切换回 SQLite");
              } catch (err: any) {
                handleApiError(err, "切换失败");
              }
            }}
            style={btnStyle}
          >
            切回 SQLite
          </button>
        </div>
      </section>

      {/* 区域三：数据迁移 */}
      <section className="legacy-surface admin-resource-panel">
        <div className="admin-resource-panel-head">
          <div>
            <p className="admin-resource-panel-kicker">数据迁移</p>
            <p className="admin-resource-panel-title">SQLite ↔ MySQL 数据迁移</p>
            <p className="admin-resource-panel-description">
              在 SQLite 和 MySQL 之间进行数据迁移。请确保已暂存 MySQL 配置。反向迁移会覆盖当前 SQLite。
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleMigrate}
              disabled={migrating}
              style={{
                ...btnStyle,
                background: migrating ? "#9ca3af" : "#dc2626",
                color: "#fff",
              }}
            >
              {migrating ? "迁移中..." : "导出至 MySQL"}
            </button>
            <button
              onClick={handleMigrateToSqlite}
              disabled={migrating}
              style={{
                ...btnStyle,
                background: migrating ? "#9ca3af" : "#f59e0b",
                color: "#fff",
              }}
            >
              {migrating ? "迁移中..." : "从 MySQL 导回"}
            </button>
          </div>
        </div>
        {migrationResults && (
          <div style={{ padding: "0 24px 16px" }}>
            <QueryTable
              headers={["表名", "迁移行数", "状态"]}
              rows={migrationResults.map((r) => [
                r.table,
                r.rows,
                r.status === "ok" ? "✅ 成功" : r.status === "skipped" ? "跳过（无数据）" : r.status,
              ])}
            />
          </div>
        )}
      </section>
      </section>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 14,
  outline: "none",
};

const btnStyle: React.CSSProperties = {
  padding: "8px 20px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 14,
  cursor: "pointer",
  background: "#fff",
};
