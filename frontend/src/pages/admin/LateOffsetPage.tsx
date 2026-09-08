import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { apiRequest } from "../../api/client";
import { fetchQueryBootstrap } from "../../api/query";
import ErrorState from "../../components/feedback/ErrorState";
import LoadingState from "../../components/feedback/LoadingState";
import QueryProgressOverlay from "../../components/feedback/QueryProgressOverlay";
import { useNotification } from "../../components/feedback/Notification";
import LateOffsetLeavesModal from "../../components/admin/LateOffsetLeavesModal";
import EmployeePicker from "../../components/query/EmployeePicker";
import QueryResultPanel from "../../components/query/QueryResultPanel";
import QueryTable from "../../components/query/QueryTable";
import AccountSetSelector from "../../components/query/AccountSetSelector";
import type { QueryBootstrap } from "../../types/query";

interface LateOffsetRow {
  emp_id: number;
  emp_no: string;
  emp_name: string;
  dept_name: string;
  is_manager?: boolean;
  date: string;
  status?: "pending" | "confirmed";
  late_minutes: number;
  offset_minutes: number;
  effective_late_minutes: number;
  override_late_minutes?: number;
}

interface LateOffsetCandidatesResponse {
  month: string;
  rows: LateOffsetRow[];
}

interface LateOffsetConfirmResponse {
  month: string;
  confirmed: Array<{ emp_id: number; date: string; late_minutes: number }>;
  skipped: Array<{ emp_id: number; date: string; error: string }>;
  rows: LateOffsetRow[];
}

interface LateOffsetClearResponse {
  month: string;
  cleared: Array<{ emp_id: number; date: string; late_minutes: number | null }>;
  skipped: Array<{ emp_id: number; date: string; error: string }>;
  rows: LateOffsetRow[];
}

function rowKey(row: LateOffsetRow): string {
  return `${row.emp_id}-${row.date}`;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function pickDefaultMonth(bootstrap: QueryBootstrap | null): string {
  const accountSets = bootstrap?.account_sets ?? [];
  return accountSets.find((accountSet) => accountSet.is_active)?.month ?? accountSets[0]?.month ?? currentMonth();
}

export default function LateOffsetPage() {
  const notification = useNotification();
  const [bootstrap, setBootstrap] = useState<QueryBootstrap | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [rows, setRows] = useState<LateOffsetRow[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [offsetEdits, setOffsetEdits] = useState<Record<string, number>>({});
  const [leaveTarget, setLeaveTarget] = useState<{ empId: number; empNo: string; empName: string } | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [hasQueried, setHasQueried] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchQueryBootstrap()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setBootstrap(payload);
        setSelectedMonth(pickDefaultMonth(payload));
      })
      .catch(() => {
        if (!cancelled) {
          setBootstrap(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isLocked = useMemo(
    () => bootstrap?.account_sets.find((accountSet) => accountSet.month === selectedMonth)?.is_locked ?? false,
    [bootstrap, selectedMonth],
  );

  const buildCandidatesUrl = useCallback((month: string, empIds: number[]): string => {
    const query = new URLSearchParams({ month });
    if (empIds.length) {
      query.set("emp_ids", empIds.join(","));
    }
    return `/api/admin/late-offset/candidates?${query.toString()}`;
  }, []);

  const queryCandidates = useCallback(
    async (month: string, empIds: number[]) => {
      if (!month) {
        notification.warning("请先选择账套月份");
        return;
      }
      setIsQuerying(true);
      try {
        const payload = await apiRequest<LateOffsetCandidatesResponse>(buildCandidatesUrl(month, empIds));
        setRows(payload.rows ?? []);
        setSelectedKeys(new Set());
        setOffsetEdits({});
        setHasQueried(true);
      } catch (error) {
        notification.error(error instanceof Error ? error.message : "查询迟到冲抵候选失败");
      } finally {
        setIsQuerying(false);
      }
    },
    [buildCandidatesUrl, notification],
  );

  const confirmItems = useCallback(
    async (items: LateOffsetRow[]) => {
      if (!items.length || !selectedMonth) {
        return;
      }
      setIsConfirming(true);
      try {
        const payload = await apiRequest<LateOffsetConfirmResponse>("/api/admin/late-offset/confirm", {
          body: {
            month: selectedMonth,
            items: items.map((row) => ({
              emp_id: row.emp_id,
              date: row.date,
              offset_minutes: offsetEdits[rowKey(row)] ?? row.offset_minutes,
            })),
          },
          method: "POST",
        });
        setRows(payload.rows ?? []);
        setSelectedKeys(new Set());
        setOffsetEdits({});
        if (payload.confirmed?.length) {
          notification.success(`已确认冲抵 ${payload.confirmed.length} 条`);
        }
        if (payload.skipped?.length) {
          notification.warning(`${payload.skipped.length} 条未处理，首条原因：${payload.skipped[0].error}`);
        }
      } catch (error) {
        notification.error(error instanceof Error ? error.message : "确认迟到冲抵失败");
      } finally {
        setIsConfirming(false);
      }
    },
    [notification, offsetEdits, selectedMonth],
  );

  const clearItems = useCallback(
    async (items: LateOffsetRow[]) => {
      if (!items.length || !selectedMonth) {
        return;
      }
      setIsConfirming(true);
      try {
        const payload = await apiRequest<LateOffsetClearResponse>("/api/admin/late-offset/clear", {
          body: {
            month: selectedMonth,
            items: items.map((row) => ({ emp_id: row.emp_id, date: row.date })),
          },
          method: "POST",
        });
        setRows(payload.rows ?? []);
        setSelectedKeys(new Set());
        setOffsetEdits({});
        if (payload.cleared?.length) {
          notification.success(`已清除冲抵 ${payload.cleared.length} 条，迟到恢复系统值`);
        }
        if (payload.skipped?.length) {
          notification.warning(`${payload.skipped.length} 条未处理，首条原因：${payload.skipped[0].error}`);
        }
      } catch (error) {
        notification.error(error instanceof Error ? error.message : "清除迟到冲抵失败");
      } finally {
        setIsConfirming(false);
      }
    },
    [notification, selectedMonth],
  );

  const toggleRow = (row: LateOffsetRow) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const key = rowKey(row);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedKeys((prev) =>
      prev.size === pendingRows.length ? new Set() : new Set(pendingRows.map(rowKey)),
    );
  };

  const handleOffsetChange = (row: LateOffsetRow, value: string) => {
    const parsed = Number(value);
    setOffsetEdits((prev) => ({
      ...prev,
      [rowKey(row)]: Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0,
    }));
  };

  const pendingRows = rows.filter((row) => row.status !== "confirmed");
  const selectedRows = pendingRows.filter((row) => selectedKeys.has(rowKey(row)));

  if (isLoading) {
    return <LoadingState message="正在准备管理人员迟到冲抵页面..." />;
  }

  if (!bootstrap) {
    return <ErrorState description="管理人员迟到冲抵初始化失败" title="管理人员迟到冲抵初始化失败" />;
  }

  const headers: Array<string | { label: ReactNode }> = [
    {
      label: (
        <input
          aria-label="全选"
          checked={pendingRows.length > 0 && selectedKeys.size === pendingRows.length}
          disabled={isConfirming || isLocked || !pendingRows.length}
          onChange={toggleAll}
          type="checkbox"
        />
      ),
    },
    "工号",
    "姓名",
    "部门",
    "日期",
    "当日迟到(分钟)",
    "冲抵(分钟)",
    "冲抵后迟到(分钟)",
    "操作",
  ];
  const tableRows: ReactNode[][] = rows.map((row) => {
    const key = rowKey(row);
    const isConfirmed = row.status === "confirmed";
    const isChecked = selectedKeys.has(key);
    return [
      <input
        aria-label={`选择 ${row.emp_name} ${row.date}`}
        checked={isChecked}
        disabled={isConfirming || isLocked || isConfirmed}
        key={`check-${key}`}
        onChange={() => toggleRow(row)}
        type="checkbox"
      />,
      row.emp_no,
      row.emp_name,
      row.dept_name,
      row.date,
      String(row.late_minutes),
      isConfirmed ? (
        `${row.offset_minutes}（已冲抵）`
      ) : (
        <input
          aria-label={`编辑冲抵分钟 ${row.emp_name} ${row.date}`}
          className="late-offset-input"
          disabled={isConfirming || isLocked}
          key={`offset-${key}`}
          min={0}
          onChange={(event) => handleOffsetChange(row, event.target.value)}
          type="number"
          value={offsetEdits[key] ?? row.offset_minutes}
        />
      ),
      String(isConfirmed ? row.override_late_minutes : Math.max(0, row.late_minutes - (offsetEdits[key] ?? row.offset_minutes))),
      isConfirmed ? (
        <div className="late-offset-row-actions" key={`actions-${key}`}>
          <button
            className="account-action-button"
            disabled={isConfirming || isLocked}
            key={`clear-${key}`}
            onClick={() => void clearItems([row])}
            type="button"
          >
            清除冲抵
          </button>
          <button
            className="account-action-button"
            key={`leaves-${key}`}
            onClick={() =>
              setLeaveTarget({ empId: row.emp_id, empNo: row.emp_no, empName: row.emp_name })
            }
            type="button"
          >
            请假记录
          </button>
        </div>
      ) : (
        <div className="late-offset-row-actions" key={`actions-${key}`}>
          <button
            className="account-action-button"
            disabled={isConfirming || isLocked}
            key={`confirm-${key}`}
            onClick={() => void confirmItems([row])}
            type="button"
          >
            确认冲抵
          </button>
          <button
            className="account-action-button"
            key={`leaves-${key}`}
            onClick={() =>
              setLeaveTarget({ empId: row.emp_id, empNo: row.emp_no, empName: row.emp_name })
            }
            type="button"
          >
            请假记录
          </button>
        </div>
      ),
    ];
  });

  return (
    <div className="query-page-shell late-offset-page">
      <aside className="query-filter-rail">
        <div className="query-filter-heading">
          <span className="query-filter-kicker">Query Filters</span>
          <h2>查询条件</h2>
          <p>按管理人员和账套查询迟到冲抵候选。</p>
        </div>
        <div className="query-filter-body">
          <div className="query-filter-field">
            <label className="form-label">管理人员</label>
            <EmployeePicker
              departments={bootstrap.departments}
              employees={bootstrap.employees}
              filterMode="manager"
              label="管理人员范围"
              onChange={setSelectedIds}
              selectedIds={selectedIds}
              showFieldChrome={false}
            />
          </div>

          <div className="query-filter-field">
            <AccountSetSelector
              accountSets={bootstrap.account_sets}
              compact
              label="账套"
              onChange={setSelectedMonth}
              value={selectedMonth}
            />
          </div>
          <div className="query-filter-field">
            <label className="form-label">主要操作</label>
            <div className="query-filter-actions">
              <button
                className="btn btn-primary"
                disabled={isQuerying}
                onClick={() => void queryCandidates(selectedMonth, selectedIds)}
                type="button"
              >
                {isQuerying ? "查询中..." : "查询"}
              </button>
              <button
                className="btn btn-outline-secondary"
                disabled={isConfirming || isLocked || !selectedRows.length}
                onClick={() => void confirmItems(selectedRows)}
                type="button"
              >
                {isConfirming ? "确认中..." : `确认冲抵(${selectedRows.length})`}
              </button>
            </div>
            {isLocked ? (
              <div className="account-lock-notice is-locked" style={{ marginTop: "4px" }}>
                {selectedMonth} 账套已锁定，不能迟到冲抵确认
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <section className="query-workspace">
        <QueryProgressOverlay active={isQuerying} progress={isQuerying ? 58 : 0} text="正在查询迟到冲抵数据..." />
        <QueryResultPanel>
          <QueryTable
            emptyText={hasQueried ? "当月没有可冲抵的迟到记录" : "请先选择月份查询"}
            headers={headers}
            panelClassName="attendance-override-table-panel"
            rows={tableRows}
            tableClassName="attendance-override-table"
          />
        </QueryResultPanel>
      </section>

      {leaveTarget ? (
        <LateOffsetLeavesModal
          empId={leaveTarget.empId}
          empName={leaveTarget.empName}
          empNo={leaveTarget.empNo}
          month={selectedMonth}
          onClose={() => setLeaveTarget(null)}
        />
      ) : null}
    </div>
  );
}
