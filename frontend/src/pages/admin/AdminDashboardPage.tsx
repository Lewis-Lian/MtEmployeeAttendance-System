import { useEffect, useMemo, useState } from "react";
import { ApiError } from "../../api/client";
import {
  activateAccountSet,
  calculateAccountSet,
  createAccountSet,
  deleteAccountSet,
  fetchAccountSetCalculationProgress,
  fetchAccountSetImports,
  fetchAccountSets,
  lockAccountSet,
  resetAccountSetImported,
  unlockAccountSet,
  updateAccountSet,
  uploadAccountSetRawFiles,
} from "../../api/admin";
import { clearQueryBootstrapCache } from "../../api/query";
import ErrorState from "../../components/feedback/ErrorState";
import LoadingState from "../../components/feedback/LoadingState";
import QueryProgressOverlay from "../../components/feedback/QueryProgressOverlay";
import QueryResultPanel from "../../components/query/QueryResultPanel";
import QueryTable from "../../components/query/QueryTable";
import AccountSetSelector from "../../components/query/AccountSetSelector";
import type { AdminAccountSet, AdminAccountSetFactoryRestEntry, AdminAccountSetImport } from "../../types/admin";
import MonthPicker from "../../components/common/MonthPicker";
import { useConfirm } from "../../components/feedback/ConfirmDialog";
import { useNotification } from "../../components/feedback/Notification";

const FILE_INPUT_LABELS = [
  "1. 请假单",
  "2. 加班单",
  "3. 员工基础数据月报",
  "4. 员工基础数据",
  "5. 管理人员基础数据月报",
  "6. 管理人员基础数据",
];

type FactoryRestPeriod = "none" | "full" | "am" | "pm";

export default function AdminDashboardPage() {
  const confirm = useConfirm();
  const notification = useNotification();
  const [accountSets, setAccountSets] = useState<AdminAccountSet[]>([]);

  const [imports, setImports] = useState<AdminAccountSetImport[]>([]);
  const [selectedAccountSetId, setSelectedAccountSetId] = useState<number | null>(null);
  const [createMonth, setCreateMonth] = useState("");
  const [monthlyBenefitDays, setMonthlyBenefitDays] = useState("0");
  const [factoryRestEntries, setFactoryRestEntries] = useState<AdminAccountSetFactoryRestEntry[]>([]);
  const [isFactoryRestDirty, setIsFactoryRestDirty] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<Array<File | null>>(() => Array.from({ length: 6 }, () => null));
  const [dragOverIndex, setDragOverIndex] = useState<Array<boolean>>(() => Array.from({ length: 6 }, () => false));
  const [progressVisible, setProgressVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [showModal, setShowModal] = useState<"settings" | "upload" | null>(null);

  const handleCloseModal = () => {
    setShowModal(null);
    setUploadFiles(Array.from({ length: 6 }, () => null));
    setDragOverIndex(Array.from({ length: 6 }, () => false));
    setProgressVisible(false);
    setProgress(0);
    setLoadingText("");
  };

  const selectedAccountSet = useMemo(
    () => accountSets.find((row) => row.id === selectedAccountSetId) ?? null,
    [accountSets, selectedAccountSetId],
  );

  const activeAccountSet = useMemo(
    () => accountSets.find((row) => row.is_active) ?? null,
    [accountSets],
  );
  const factoryRestSummary = useMemo(
    () => factoryRestEntries.reduce((sum, entry) => sum + Number(entry.unit || 0), 0),
    [factoryRestEntries],
  );
  const factoryRestCalendar = useMemo(
    () => buildFactoryRestCalendar(selectedAccountSet?.month ?? "", factoryRestEntries),
    [factoryRestEntries, selectedAccountSet?.month],
  );

  const tableHeaders = ["时间", "文件名", "类型", "结果", "条数", "错误"];
  const tableRows = useMemo(() => {
    return imports.map((record) => [
      formatDateTime(record.created_at),
      record.source_filename || "-",
      record.file_type || "-",
      record.status || "-",
      record.imported_count ?? 0,
      record.error_message || "-",
    ]);
  }, [imports]);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const rows = await fetchAccountSets();
        if (!mounted) {
          return;
        }
        setAccountSets(rows);
        const preferredAccountSet = rows.find((row) => row.is_active) ?? rows[0] ?? null;
        setSelectedAccountSetId(preferredAccountSet?.id ?? null);
        setError("");
      } catch (caughtError) {
        if (!mounted) {
          return;
        }
        setError(caughtError instanceof ApiError ? caughtError.message : "账套中心初始化失败");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedAccountSet) {
      setMonthlyBenefitDays("0");
      setFactoryRestEntries([]);
      setIsFactoryRestDirty(false);
      setImports([]);
      return;
    }

    setMonthlyBenefitDays(String(selectedAccountSet.monthly_benefit_days ?? 0));
    setFactoryRestEntries(selectedAccountSet.factory_rest_entries ?? []);
    setIsFactoryRestDirty(false);
  }, [selectedAccountSet]);

  useEffect(() => {
    if (!selectedAccountSetId) {
      setImports([]);
      return;
    }

    const accountSetId = selectedAccountSetId;
    let mounted = true;

    async function loadImports() {
      try {
        const rows = await fetchAccountSetImports(accountSetId);
        if (mounted) {
          setImports(rows);
        }
      } catch (caughtError) {
        if (!mounted) {
          return;
        }
        notification.error(caughtError instanceof ApiError ? caughtError.message : "账套导入记录加载失败");
      }
    }

    loadImports();
    return () => {
      mounted = false;
    };
  }, [selectedAccountSetId]);

  async function reloadAccountSets(preferredId?: number | null) {
    const rows = await fetchAccountSets();
    setAccountSets(rows);
    const fallbackAccountSet =
      rows.find((row) => row.id === preferredId) ??
      rows.find((row) => row.id === selectedAccountSetId) ??
      rows.find((row) => row.is_active) ??
      rows[0] ??
      null;
    setSelectedAccountSetId(fallbackAccountSet?.id ?? null);
  }

  async function runAction(action: () => Promise<void>) {
    setIsWorking(true);
    try {
      await action();
    } catch (caughtError) {
      notification.error(caughtError instanceof ApiError ? caughtError.message : "操作失败，请稍后重试");
    } finally {
      setIsWorking(false);
    }
  }

  async function runCalculation(mode: "employee" | "manager") {
    if (!selectedAccountSet) {
      return;
    }

    setProgressVisible(true);
    setProgress(0);
    setLoadingText(
      mode === "employee"
        ? "正在对员工考勤进行汇总与数据结算..."
        : "正在计算管理人员考勤及年假加班额度...",
    );

    // 轮询后端真实计算进度（文件导入按行、管理人员汇总按人推进）
    const poll = setInterval(() => {
      void fetchAccountSetCalculationProgress(selectedAccountSet.id, mode)
        .then((progress) => {
          if (progress.status !== "idle") {
            setProgress(progress.percent);
            if (progress.stage) {
              setLoadingText(progress.stage);
            }
          }
        })
        .catch(() => {
          // 单次轮询失败不中断进度显示，等计算响应或下一次轮询
        });
    }, 1000);

    try {
      await calculateAccountSet(selectedAccountSet.id, mode);
      setProgress(100);
      setLoadingText(mode === "employee" ? "员工考勤结算成功！" : "管理人员考勤计算成功！");
      await reloadAccountSets(selectedAccountSet.id);
      notification.success(mode === "employee" ? "员工计算成功" : "管理人员计算成功");
    } catch (caughtError) {
      notification.error(
        caughtError instanceof ApiError
          ? caughtError.message
          : mode === "employee"
            ? "员工考勤结算失败"
            : "管理人员考勤计算失败",
      );
    } finally {
      clearInterval(poll);
      setTimeout(() => {
        setProgressVisible(false);
      }, 500);
    }
  }

  function currentFactoryRestState(date: string): FactoryRestPeriod {
    const currentEntry = factoryRestEntries.find((entry) => entry.date === date);
    if (!currentEntry) {
      return "none";
    }
    if (currentEntry.period === "full" || currentEntry.period === "am" || currentEntry.period === "pm") {
      return currentEntry.period;
    }
    return "none";
  }

  function toggleFactoryRestDay(date: string) {
    if (!selectedAccountSet || selectedAccountSet.is_locked) {
      return;
    }

    const nextPeriod = nextFactoryRestPeriod(currentFactoryRestState(date));
    const nextEntries = factoryRestEntries.filter((entry) => entry.date !== date);
    if (nextPeriod !== "none") {
      nextEntries.push({
        date,
        period: nextPeriod,
        unit: factoryRestUnit(nextPeriod),
      });
    }
    setFactoryRestEntries(sortFactoryRestEntries(nextEntries));
    setIsFactoryRestDirty(true);
  }

  if (isLoading) {
    return <LoadingState message="正在加载账套中心..." />;
  }

  if (error && !accountSets.length && !selectedAccountSet) {
    return <ErrorState description={error} title="账套中心加载失败" />;
  }

  return (
    <section className="account-center-page">
      <QueryProgressOverlay active={progressVisible} className="query-progress-overlay-page" progress={progress} text={loadingText} />


      {/* 顶部控制与账套信息行 */}
      <div className="account-top-control-row" style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "12px",
        marginBottom: "16px",
        marginTop: "16px"
      }}>
        {/* 左侧：控制按钮组 */}
        <div className="account-panel-selector" style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            className="btn-settings"
            onClick={() => setShowModal("settings")}
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            账套设置
          </button>
          <button
            className="btn-upload"
            onClick={() => setShowModal("upload")}
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            上传原始文档
          </button>
          <button
            className="btn-calc-employee"
            disabled={!selectedAccountSet || selectedAccountSet.is_locked || isWorking}
            onClick={() => void runAction(() => runCalculation("employee"))}
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="9" x2="15" y2="15"></line>
              <line x1="15" y1="9" x2="9" y2="15"></line>
            </svg>
            员工计算
          </button>
          <button
            className="btn-calc-manager"
            disabled={!selectedAccountSet || selectedAccountSet.is_locked || isWorking}
            onClick={() => void runAction(() => runCalculation("manager"))}
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="8.5" cy="7" r="4"></circle>
              <polyline points="17 11 19 13 23 9"></polyline>
            </svg>
            管理人员计算
          </button>
        </div>

        {/* 右侧：当前激活账套信息摘要 */}
        <div className="active-account-set-summary-bar" style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          minHeight: "36px",
          boxSizing: "border-box",
          padding: "0 16px",
          background: "var(--ent-secondary-bg, #f8fafc)",
          border: "1px solid var(--ent-border-strong)",
          borderRadius: "var(--ent-radius-lg, 8px)",
          fontSize: "13.5px",
          color: "var(--ent-text)",
          boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.02)"
        }}>
          {activeAccountSet ? (
            <>
              <div className="admin-row">
                <span style={{ color: "var(--ent-text-secondary)", fontWeight: "500" }}>当前激活账套：</span>
                <strong style={{ fontSize: "14.5px", color: "var(--ent-primary, #0f172a)" }}>{activeAccountSet.name}</strong>
              </div>
              <div style={{ width: "1px", height: "16px", background: "var(--ent-border-strong)", opacity: 0.6 }} />
              <div className="admin-row">
                <span style={{ color: "var(--ent-text-secondary)" }}>账套状态：</span>
                <span className={`badge ${activeAccountSet.is_locked ? "badge-danger" : "badge-success"}`} style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontSize: "11.5px",
                  fontWeight: "600",
                  background: activeAccountSet.is_locked ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
                  color: activeAccountSet.is_locked ? "#ef4444" : "#22c55e",
                  border: activeAccountSet.is_locked ? "1px solid rgba(239, 68, 68, 0.15)" : "1px solid rgba(34, 197, 94, 0.15)"
                }}>
                  {activeAccountSet.is_locked ? "已锁定" : "未锁定"}
                </span>
              </div>
              <div style={{ width: "1px", height: "16px", background: "var(--ent-border-strong)", opacity: 0.6 }} />
              <div className="admin-row">
                <span style={{ color: "var(--ent-text-secondary)" }}>厂休天数：</span>
                <strong style={{ color: "var(--ent-primary)" }}>{activeAccountSet.factory_rest_entries?.reduce((sum, entry) => sum + Number(entry.unit || 0), 0) ?? 0} 天</strong>
              </div>
              <div style={{ width: "1px", height: "16px", background: "var(--ent-border-strong)", opacity: 0.6 }} />
              <div className="admin-row">
                <span style={{ color: "var(--ent-text-secondary)" }}>福利天数：</span>
                <strong style={{ color: "var(--ent-primary)" }}>{activeAccountSet.monthly_benefit_days ?? 0} 天</strong>
              </div>
            </>
          ) : (
            <span style={{ color: "var(--ent-text-secondary)" }}>暂无激活账套</span>
          )}
        </div>
      </div>

      <div className="account-workflow" style={{ display: "block" }}>
        <div className="account-workflow-main" style={{ width: "100%", flex: 1 }}>
          <div className="account-card-header" style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 4px",
            borderBottom: "none",
            background: "transparent"
          }}>
            <span style={{ fontSize: "16px", fontWeight: "600" }}>账套导入记录</span>
            <span className="account-card-header-note">按当前选中账套展示</span>
          </div>
          <QueryResultPanel>
            <QueryTable
              emptyText="暂无导入记录"
              headers={tableHeaders}
              rows={tableRows}
            />
          </QueryResultPanel>
        </div>
      </div>

      {showModal && (
        <div
          className="master-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseModal();
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1500,
            background: "rgba(15, 23, 42, 0.3)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "grid",
            placeItems: "center",
            padding: "24px",
            boxSizing: "border-box",
          }}
        >
          <div
            className="master-modal-container"
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              width: "100%",
              maxWidth: showModal === "settings" ? "800px" : "600px",
              maxHeight: "90vh",
              overflowY: "auto",
              position: "relative",
              padding: "48px 24px 24px 24px",
              boxSizing: "border-box",
            }}
          >
            <QueryProgressOverlay active={progressVisible} className="query-progress-overlay-modal" progress={progress} text={loadingText} />

            {/* 关闭按钮 */}
            <button
              onClick={handleCloseModal}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                border: "none",
                background: "transparent",
                fontSize: "20px",
                cursor: "pointer",
                color: "#64748b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                transition: "background 0.2s",
              }}
              type="button"
              aria-label="关闭"
            >
              ×
            </button>

            {showModal === "settings" && (
              <div className="settings-double-panel">
                {/* 左面板 */}
                <div className="settings-panel-left">
                  {/* 创建账套卡片 */}
                  <div className="settings-card-module">
                    <div className="settings-card-title">月度账套</div>
                    <form
                      className="settings-form-row"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!createMonth) {
                          notification.warning("请选择账套月份");
                          return;
                        }
                        void runAction(async () => {
                          setProgressVisible(true);
                          setProgress(0);
                          setLoadingText("正在创建新账套...");
                          let current = 0;
                          const interval = setInterval(() => {
                            current += Math.floor(Math.random() * 15) + 5;
                            if (current >= 95) current = 95;
                            setProgress(current);
                          }, 80);
                          try {
                            const payload = await createAccountSet(createMonth);
                            setCreateMonth("");
                            clearInterval(interval);
                            setProgress(100);
                            setLoadingText("新账套创建成功！");
                            notification.success(`创建成功：${payload.account_set.name}`);
                            await reloadAccountSets(payload.account_set.id);
                          } catch (caughtError) {
                            clearInterval(interval);
                            notification.error(caughtError instanceof ApiError ? caughtError.message : "创建账套失败");
                          } finally {
                            setTimeout(() => {
                              setProgressVisible(false);
                            }, 500);
                          }
                        });
                      }}
                    >
                      <label className="settings-field" style={{ flex: 1, marginBottom: 0 }}>
                        <span className="settings-field-label">账套月份</span>
                        <MonthPicker
                          onChange={(val) => setCreateMonth(val)}
                          value={createMonth}
                        />
                      </label>
                      <button disabled={isWorking} type="submit">
                        创建
                      </button>
                    </form>
                  </div>

                  {/* 当前账套激活与状态卡片 */}
                  <div className="settings-card-module">
                    <div className="settings-card-title">当前账套</div>
                    <AccountSetSelector
                      accountSets={accountSets}
                      compact
                      label="选择账套"
                      onChange={(month) => {
                        const accountSet = accountSets.find((item) => item.month === month);
                        setSelectedAccountSetId(accountSet?.id ?? null);
                      }}
                      value={selectedAccountSet?.month ?? ""}
                    />
                    <div className="account-lock-notice" style={{ margin: "8px 0 0 0", fontSize: "12px", lineHeight: "1.4" }}>
                      {!selectedAccountSet
                        ? "请选择账套"
                        : selectedAccountSet.is_locked
                          ? "该账套已锁定，仅允许查看、设为当前和解锁。"
                          : "该账套未锁定，可继续上传、计算和修改。"}
                    </div>
                  </div>

                  {/* 账套控制动作栏 */}
                  <div className="settings-toolbar">
                    <button
                      className="btn-set-current"
                      disabled={!selectedAccountSet || isWorking}
                      onClick={() =>
                        void runAction(async () => {
                          if (!selectedAccountSet) {
                            return;
                          }
                          setProgressVisible(true);
                          setProgress(0);
                          setLoadingText("正在设置当前激活账套...");
                          let current = 0;
                          const interval = setInterval(() => {
                            current += Math.floor(Math.random() * 15) + 10;
                            if (current >= 95) current = 95;
                            setProgress(current);
                          }, 60);
                          try {
                            await activateAccountSet(selectedAccountSet.id);
                            clearInterval(interval);
                            setProgress(100);
                            setLoadingText("当前账套设置成功！");
                            notification.success(`已切换当前账套：${selectedAccountSet.name}`);
                            clearQueryBootstrapCache();
                            window.dispatchEvent(new CustomEvent("account-set-active-changed"));
                            await reloadAccountSets(selectedAccountSet.id);
                          } catch (caughtError) {
                            clearInterval(interval);
                            notification.error(caughtError instanceof ApiError ? caughtError.message : "设置当前账套失败");
                          } finally {
                            setTimeout(() => {
                              setProgressVisible(false);
                            }, 500);
                          }
                        })
                      }
                      type="button"
                    >
                      设为当前
                    </button>
                    <button
                      className="btn-lock-set"
                      disabled={!selectedAccountSet || selectedAccountSet.is_locked || isWorking}
                      onClick={() =>
                        void runAction(async () => {
                          if (!selectedAccountSet) {
                            return;
                          }
                          const isConfirmed = await confirm({
                            message: "确认锁定该账套吗？锁定后将不能上传、计算、修正或删除。",
                            type: "warning",
                          });
                          if (!isConfirmed) {
                            return;
                          }
                          setProgressVisible(true);
                          setProgress(0);
                          setLoadingText("正在锁定当前账套...");
                          let current = 0;
                          const interval = setInterval(() => {
                            current += Math.floor(Math.random() * 15) + 10;
                            if (current >= 95) current = 95;
                            setProgress(current);
                          }, 60);
                          try {
                            await lockAccountSet(selectedAccountSet.id);
                            clearInterval(interval);
                            setProgress(100);
                            setLoadingText("账套已锁定！");
                            notification.success(`账套已锁定：${selectedAccountSet.name}`);
                            await reloadAccountSets(selectedAccountSet.id);
                          } catch (caughtError) {
                            clearInterval(interval);
                            notification.error(caughtError instanceof ApiError ? caughtError.message : "锁定账套失败");
                          } finally {
                            setTimeout(() => {
                              setProgressVisible(false);
                            }, 500);
                          }
                        })
                      }
                      type="button"
                    >
                      锁定账套
                    </button>
                    <button
                      className="btn-unlock-set"
                      disabled={!selectedAccountSet || !selectedAccountSet.is_locked || isWorking}
                      onClick={() =>
                        void runAction(async () => {
                          if (!selectedAccountSet) {
                            return;
                          }
                          const isConfirmed = await confirm({
                            message: "确认解锁该账套吗？解锁后将恢复修改能力。",
                            type: "info",
                          });
                          if (!isConfirmed) {
                            return;
                          }
                          setProgressVisible(true);
                          setProgress(0);
                          setLoadingText("正在解锁当前账套...");
                          let current = 0;
                          const interval = setInterval(() => {
                            current += Math.floor(Math.random() * 15) + 10;
                            if (current >= 95) current = 95;
                            setProgress(current);
                          }, 60);
                          try {
                            await unlockAccountSet(selectedAccountSet.id);
                            clearInterval(interval);
                            setProgress(100);
                            setLoadingText("账套已解锁！");
                            notification.success(`账套已解锁：${selectedAccountSet.name}`);
                            await reloadAccountSets(selectedAccountSet.id);
                          } catch (caughtError) {
                            clearInterval(interval);
                            notification.error(caughtError instanceof ApiError ? caughtError.message : "解锁账套失败");
                          } finally {
                            setTimeout(() => {
                              setProgressVisible(false);
                            }, 500);
                          }
                        })
                      }
                      type="button"
                    >
                      解锁账套
                    </button>
                    <button
                      className="btn-delete-set"
                      disabled={!selectedAccountSet || selectedAccountSet.is_locked || isWorking}
                      onClick={() =>
                        void runAction(async () => {
                          if (!selectedAccountSet) {
                            return;
                          }
                          const isConfirmed = await confirm({
                            message:
                              `确认清空 ${selectedAccountSet.month} 账套的已导入数据吗？` +
                              "将删除该月的月报、日报、请假单、加班单数据及全部归档文件，" +
                              "清空后需要重新上传源文件并重新计算，且不影响其他月份。",
                            type: "danger",
                          });
                          if (!isConfirmed) {
                            return;
                          }
                          setProgressVisible(true);
                          setProgress(0);
                          setLoadingText("正在清空已导入数据...");
                          try {
                            const result = await resetAccountSetImported(selectedAccountSet.id);
                            setProgress(100);
                            setLoadingText("已导入数据已清空！");
                            const deletedTotal = Object.values(result.deleted ?? {}).reduce((sum, count) => sum + count, 0);
                            notification.success(`已清空 ${selectedAccountSet.month} 已导入数据（共 ${deletedTotal} 条记录），请重新上传源文件。`);
                            await reloadAccountSets(selectedAccountSet.id);
                          } catch (caughtError) {
                            notification.error(caughtError instanceof ApiError ? caughtError.message : "清空已导入数据失败");
                          } finally {
                            setTimeout(() => {
                              setProgressVisible(false);
                            }, 500);
                          }
                        })
                      }
                      type="button"
                    >
                      清空已导入数据
                    </button>
                    <button
                      className="btn-delete-set"
                      disabled={!selectedAccountSet || selectedAccountSet.is_locked || isWorking}
                      onClick={() =>
                        void runAction(async () => {
                          if (!selectedAccountSet) {
                            return;
                          }
                          const isConfirmed = await confirm({
                            message: "确认删除该账套吗？将同时删除账套下的归档文件记录。",
                            type: "danger",
                          });
                          if (!isConfirmed) {
                            return;
                          }
                          setProgressVisible(true);
                          setProgress(0);
                          setLoadingText("正在删除该账套...");
                          let current = 0;
                          const interval = setInterval(() => {
                            current += Math.floor(Math.random() * 15) + 10;
                            if (current >= 95) current = 95;
                            setProgress(current);
                          }, 60);
                          try {
                            await deleteAccountSet(selectedAccountSet.id);
                            clearInterval(interval);
                            setProgress(100);
                            setLoadingText("账套已成功删除！");
                            notification.success("账套已删除");
                            await reloadAccountSets(null);
                          } catch (caughtError) {
                            clearInterval(interval);
                            notification.error(caughtError instanceof ApiError ? caughtError.message : "删除账套失败");
                          } finally {
                            setTimeout(() => {
                              setProgressVisible(false);
                            }, 500);
                          }
                        })
                      }
                      type="button"
                    >
                      删除
                    </button>

                    <button
                      className="btn-refresh-set"
                      disabled={isWorking}
                      onClick={() => void runAction(async () => reloadAccountSets(selectedAccountSetId))}
                      type="button"
                    >
                      刷新
                    </button>
                  </div>
                </div>

                {/* 右面板 */}
                <div className="settings-panel-right">
                  {/* 参数配置卡片 */}
                  <div className="settings-card-module">
                    <div className="settings-card-title">参数设置</div>
                    <div className="account-params-grid admin-form-grid">
                      <label className="settings-field" style={{ marginBottom: 0 }}>
                        <span className="settings-field-label">本月厂休天数</span>
                        <input className="settings-input" readOnly type="number" value={factoryRestSummary} />
                      </label>
                      <label className="settings-field" style={{ marginBottom: 0 }}>
                        <span className="settings-field-label">本月可用福利天数</span>
                        <input
                          className="settings-input"
                          disabled={!selectedAccountSet || selectedAccountSet.is_locked}
                          min={0}
                          onChange={(event) => setMonthlyBenefitDays(event.target.value)}
                          step={0.5}
                          type="number"
                          value={monthlyBenefitDays}
                        />
                      </label>
                    </div>
                  </div>

                  {/* 厂休日期配置日历 */}
                  <div className="settings-card-module factory-rest-panel" style={{ border: "none", boxShadow: "none", padding: 0, background: "transparent" }}>
                    <div className="factory-rest-panel-head">
                      <div>
                        <div className="factory-rest-panel-kicker">厂休配置</div>
                        <div className="factory-rest-panel-title">厂休日期明细</div>
                      </div>
                      <span
                        className={`factory-rest-state-badge${
                          selectedAccountSet?.is_locked ? " factory-rest-state-badge--locked" : " factory-rest-state-badge--editable"
                        }`}
                      >
                        {!selectedAccountSet ? "请选择账套" : selectedAccountSet.is_locked ? "已锁定" : "可编辑"}
                      </span>
                    </div>

                    <div className="factory-rest-summary-card">
                      <div>
                        <div className="factory-rest-summary-label">本月汇总</div>
                        <div className="factory-rest-summary-value">
                          <span>{factoryRestSummary}</span>
                          <span className="factory-rest-summary-unit">天</span>
                        </div>
                      </div>
                      <div className="factory-rest-summary-meta">
                        <div>
                          <span className="factory-rest-summary-meta-label">已选日期</span>
                          <span>{factoryRestEntries.length} 天</span>
                        </div>
                        <div>
                          <span className="factory-rest-summary-meta-label">切换方式</span>
                          <span>上班 / 全天 / 上午 / 下午</span>
                        </div>
                      </div>
                    </div>

                    <div className="factory-rest-panel-note">
                      点击日期卡片按“上班 → 全天 → 上午 → 下午 → 上班”循环切换，系统会自动汇总厂休天数。
                    </div>

                    <div className="factory-rest-legend" aria-hidden="true" style={{ marginTop: "12px", marginBottom: "12px" }}>
                      <span className="factory-rest-legend-item">
                        <span className="factory-rest-legend-dot factory-rest-legend-dot--none" />
                        上班
                      </span>
                      <span className="factory-rest-legend-item">
                        <span className="factory-rest-legend-dot factory-rest-legend-dot--am" />
                        上午
                      </span>
                      <span className="factory-rest-legend-item">
                        <span className="factory-rest-legend-dot factory-rest-legend-dot--pm" />
                        下午
                      </span>
                      <span className="factory-rest-legend-item">
                        <span className="factory-rest-legend-dot factory-rest-legend-dot--full" />
                        全天
                      </span>
                    </div>

                    {factoryRestCalendar ? (
                      <div className="factory-rest-grid">
                        {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
                          <div key={day} className="factory-rest-weekday">
                            周{day}
                          </div>
                        ))}
                        {factoryRestCalendar.leadingEmptySlots.map((slot) => (
                          <div key={`spacer-${slot}`} className="factory-rest-spacer" />
                        ))}
                        {factoryRestCalendar.days.map((day) => {
                          const state = currentFactoryRestState(day.date);
                          return (
                            <button
                              className={`factory-rest-day factory-rest-day--${state}`}
                              disabled={!selectedAccountSet || selectedAccountSet.is_locked}
                              key={day.date}
                              onClick={() => toggleFactoryRestDay(day.date)}
                              type="button"
                            >
                              <span className="factory-rest-day-number">{day.dayOfMonth}</span>
                              <span className="factory-rest-day-state">{factoryRestStateLabel(state)}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="factory-rest-empty">请选择账套后设置厂休明细</div>
                    )}
                  </div>

                  {/* 保存动作栏 */}
                  <div className="settings-toolbar" style={{ marginTop: "8px" }}>
                    <button
                      className="btn-save-params"
                      disabled={!selectedAccountSet || selectedAccountSet.is_locked || isWorking}
                      onClick={() =>
                        void runAction(async () => {
                          if (!selectedAccountSet) {
                            return;
                          }
                          setProgressVisible(true);
                          setProgress(0);
                          setLoadingText("正在保存账套参数与厂休明细...");
                          let current = 0;
                          const interval = setInterval(() => {
                            current += Math.floor(Math.random() * 15) + 10;
                            if (current >= 95) current = 95;
                            setProgress(current);
                          }, 80);
                          try {
                            const payload: { monthly_benefit_days: string; factory_rest_entries?: AdminAccountSetFactoryRestEntry[] } = {
                              monthly_benefit_days: monthlyBenefitDays,
                            };
                            if (isFactoryRestDirty) {
                              payload.factory_rest_entries = factoryRestEntries;
                            }
                            await updateAccountSet(selectedAccountSet.id, payload);
                            clearInterval(interval);
                            setProgress(100);
                            setLoadingText("账套参数已保存！");
                            notification.success("账套参数已保存");
                            await reloadAccountSets(selectedAccountSet.id);
                          } catch (caughtError) {
                            clearInterval(interval);
                            notification.error(caughtError instanceof ApiError ? caughtError.message : "保存参数失败");
                          } finally {
                            setTimeout(() => {
                              setProgressVisible(false);
                            }, 500);
                          }
                        })
                      }
                      type="button"
                    >
                      保存参数
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showModal === "upload" && (
              <div className="account-import-card" style={{ border: "none", boxShadow: "none", margin: 0, padding: 0 }}>
                <div style={{ borderBottom: "1px solid var(--ent-border)", paddingBottom: "12px", marginBottom: "16px" }}>
                  <span style={{ fontSize: "16px", fontWeight: "600", color: "var(--ent-text)" }}>导入考勤原始表</span>
                </div>
                <div className="account-card-body" style={{ padding: 0 }}>
                  <div className="panel-note">
                    可一次上传全部源文件，也可只上传需要更新的部分文件；同一类型的新文件会替换该账套里已有的归档文件。点击“开始计算”后才会生成并持久化考勤数据。
                  </div>

                  <div className="premium-upload-grid">
                    {FILE_INPUT_LABELS.map((label, index) => {
                      const file = uploadFiles[index];
                      const isDragOver = dragOverIndex[index];
                      const fileInputId = `file-input-${index}`;
                      return (
                        <div
                          className={`upload-slot-card ${file ? "has-file" : ""} ${isDragOver ? "is-dragover" : ""}`}
                          key={label}
                          onClick={() => {
                            document.getElementById(fileInputId)?.click();
                          }}
                          onDragLeave={(e) => {
                            e.preventDefault();
                            const nextDrag = [...dragOverIndex];
                            nextDrag[index] = false;
                            setDragOverIndex(nextDrag);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            const nextDrag = [...dragOverIndex];
                            nextDrag[index] = true;
                            setDragOverIndex(nextDrag);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const nextDrag = [...dragOverIndex];
                            nextDrag[index] = false;
                            setDragOverIndex(nextDrag);

                            const droppedFile = e.dataTransfer.files?.[0] ?? null;
                            if (droppedFile) {
                              const nextFiles = [...uploadFiles];
                              nextFiles[index] = droppedFile;
                              setUploadFiles(nextFiles);
                            }
                          }}
                        >
                          <input
                            id={fileInputId}
                            style={{ display: "none" }}
                            onChange={(event) => {
                              const nextFiles = [...uploadFiles];
                              nextFiles[index] = event.target.files?.[0] ?? null;
                              setUploadFiles(nextFiles);
                            }}
                            type="file"
                          />

                          {file && (
                            <button
                              className="upload-slot-clear"
                              onClick={(e) => {
                                e.stopPropagation();
                                const nextFiles = [...uploadFiles];
                                nextFiles[index] = null;
                                setUploadFiles(nextFiles);
                              }}
                              title="清除选择"
                              type="button"
                            >
                              ×
                            </button>
                          )}

                           <div className="upload-slot-icon">
                             {file ? (
                               <svg
                                 width="24"
                                 height="24"
                                 viewBox="0 0 24 24"
                                 fill="none"
                                 stroke="currentColor"
                                 strokeWidth="1.5"
                                 strokeLinecap="round"
                                 strokeLinejoin="round"
                               >
                                 <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                 <polyline points="14 2 14 8 20 8" />
                               </svg>
                             ) : (
                               <svg
                                 width="24"
                                 height="24"
                                 viewBox="0 0 24 24"
                                 fill="none"
                                 stroke="currentColor"
                                 strokeWidth="1.5"
                                 strokeLinecap="round"
                                 strokeLinejoin="round"
                               >
                                 <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                               </svg>
                             )}
                           </div>
                          <div className="upload-slot-title">{label}</div>
                          <div className="upload-slot-status">
                            {file ? `${file.name} (${(file.size / 1024).toFixed(1)} KB)` : "点击选择或拖拽文件"}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="toolbar-premium">
                    <button
                      className="legacy-btn-primary account-primary-button"
                      disabled={!selectedAccountSet || selectedAccountSet.is_locked || isWorking}
                      onClick={() =>
                        void runAction(async () => {
                          if (!selectedAccountSet) {
                            return;
                          }
                          const files = uploadFiles.filter((file): file is File => Boolean(file));
                          if (!files.length) {
                            notification.warning("请至少选择一个要上传的源文件");
                            return;
                          }

                          setProgressVisible(true);
                          setProgress(0);
                          setLoadingText("正在上传原始文件...");

                          try {
                            const response = await uploadAccountSetRawFiles(selectedAccountSet.id, files, (percent) => {
                              setProgress(percent);
                              if (percent >= 100) {
                                setLoadingText("上传完成，正在归档原始文件...");
                              }
                            });
                            setProgress(100);
                            setLoadingText("文件上传完成！正在同步账套状态...");
                            setUploadFiles(Array.from({ length: 6 }, () => null));
                            await reloadAccountSets(selectedAccountSet.id);
                            const rejectedFiles = (response.results ?? []).filter((result) => result.status === "error");
                            if (rejectedFiles.length) {
                              notification.warning(
                                `上传完成，${rejectedFiles.length} 个文件被拒绝：${rejectedFiles
                                  .map((result) => `${result.file}（${result.error ?? "未知原因"}）`)
                                  .join("；")}`,
                              );
                            } else {
                              notification.success("上传成功，已归档到账套。");
                            }
                            setShowModal(null);
                          } catch (caughtError) {
                            notification.error(caughtError instanceof ApiError ? caughtError.message : "文件上传失败");
                          } finally {
                            setTimeout(() => {
                              setProgressVisible(false);
                            }, 500);
                          }
                        })
                      }
                      style={{
                        background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
                        color: "#ffffff"
                      }}
                      type="button"
                    >
                      上传原始文件
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function buildFactoryRestCalendar(month: string, entries: AdminAccountSetFactoryRestEntry[]) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return null;
  }

  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const firstDate = new Date(year, monthIndex, 1);
  const lastDate = new Date(year, monthIndex + 1, 0);
  const leadingEmptySlots = Array.from({ length: (firstDate.getDay() + 6) % 7 }, (_, index) => index);
  const entryMap = new Map(entries.map((entry) => [entry.date, entry.period]));

  const days = Array.from({ length: lastDate.getDate() }, (_, index) => {
    const dayOfMonth = index + 1;
    const isoDate = `${month}-${String(dayOfMonth).padStart(2, "0")}`;
    return {
      date: isoDate,
      dayOfMonth,
      period: entryMap.get(isoDate) ?? "none",
    };
  });

  return { days, leadingEmptySlots };
}

function nextFactoryRestPeriod(current: FactoryRestPeriod): FactoryRestPeriod {
  switch (current) {
    case "none":
      return "full";
    case "full":
      return "am";
    case "am":
      return "pm";
    default:
      return "none";
  }
}

function factoryRestUnit(period: FactoryRestPeriod) {
  if (period === "full") {
    return 1;
  }
  if (period === "am" || period === "pm") {
    return 0.5;
  }
  return 0;
}

function factoryRestStateLabel(period: FactoryRestPeriod) {
  switch (period) {
    case "full":
      return "全天";
    case "am":
      return "上午";
    case "pm":
      return "下午";
    default:
      return "上班";
  }
}

function sortFactoryRestEntries(entries: AdminAccountSetFactoryRestEntry[]) {
  return [...entries].sort((left, right) => {
    const leftDate = left.date ?? "";
    const rightDate = right.date ?? "";
    if (leftDate === rightDate) {
      return (left.period ?? "").localeCompare(right.period ?? "");
    }
    return leftDate.localeCompare(rightDate);
  });
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }
  return value.replace("T", " ").slice(0, 19);
}
