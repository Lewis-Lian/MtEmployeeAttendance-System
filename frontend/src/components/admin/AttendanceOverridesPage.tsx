import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

import { apiRequest, buildApiUrl } from "../../api/client";
import { useNotification } from "../feedback/Notification";
import { fetchQueryBootstrap } from "../../api/query";
import ErrorState from "../feedback/ErrorState";
import LoadingState from "../feedback/LoadingState";
import QueryProgressOverlay from "../feedback/QueryProgressOverlay";
import EmployeePicker from "../query/EmployeePicker";
import QueryResultPanel from "../query/QueryResultPanel";
import QueryTable from "../query/QueryTable";
import type { AccountSet, QueryBootstrap } from "../../types/query";
import MonthPicker from "../common/MonthPicker";
import AttendanceOverrideCalendarModal from "./AttendanceOverrideCalendarModal";

interface OverrideEmployee {
  id: number;
  emp_no: string;
  name: string;
  dept_name?: string;
}

interface OverrideValues {
  remark?: string;
  updated_at?: string;
  updated_by_name?: string;
  [key: string]: unknown;
}

interface AttendanceOverrideRow {
  employee: OverrideEmployee;
  automatic: OverrideValues | null;
  override: OverrideValues | null;
  applied: OverrideValues | null;
}

interface AttendanceOverrideResponse {
  month: string;
  rows: AttendanceOverrideRow[];
}

interface FieldConfig {
  key: string;
  label: string;
  inputMode: "decimal" | "numeric";
}

interface AttendanceOverridesPageProps {
  title: string;
  pickerLabel: string;
  pickerButtonLabel: string;
  listEmptyHint: string;
  editTitle: string;
  endpointBase: "/api/admin/employee-attendance-overrides" | "/api/admin/manager-attendance-overrides";
  filterMode: "employee" | "manager";
  fields: FieldConfig[];
}

export default function AttendanceOverridesPage({
  title,
  pickerLabel,
  pickerButtonLabel,
  listEmptyHint,
  editTitle,
  endpointBase,
  filterMode,
  fields,
}: AttendanceOverridesPageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [bootstrap, setBootstrap] = useState<QueryBootstrap | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isQuerying, setIsQuerying] = useState(false);
  const notification = useNotification();
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [rows, setRows] = useState<AttendanceOverrideRow[]>([]);
  const [hasQueried, setHasQueried] = useState(false);
  const [editingRow, setEditingRow] = useState<AttendanceOverrideRow | null>(null);
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [progressVisible, setProgressVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadBootstrap() {
      try {
        const payload = await fetchQueryBootstrap();
        if (!mounted) {
          return;
        }
        setBootstrap(payload);
        setSelectedMonth(pickDefaultMonth(payload.account_sets));
      } catch (caughtError) {
        if (!mounted) {
          return;
        }
        notification.error(caughtError instanceof Error ? caughtError.message : "修正中心初始化失败");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void loadBootstrap();
    return () => {
      mounted = false;
    };
  }, [notification]);

  const currentAccountSet = useMemo(
    () => bootstrap?.account_sets.find((accountSet) => accountSet.month === selectedMonth) ?? null,
    [bootstrap, selectedMonth],
  );
  const isLocked = Boolean(currentAccountSet?.is_locked);
  const lockNotice = isLocked
    ? `${selectedMonth || "-" } 账套已锁定，当前仅可查看列表和修正详情`
    : "";
  const tableHeaders = [
    "工号",
    "姓名",
    "部门",
    "系统值",
    "手工修正",
    "最终应用",
    "备注",
    "更新时间",
    { label: "操作", sortable: false as const },
  ];
  const tableRows = rows.map((row) => [
    row.employee.emp_no || "-",
    row.employee.name || "-",
    row.employee.dept_name || "-",
    summarizeValues(row.automatic, fields),
    summarizeValues(row.override, fields),
    summarizeValues(row.applied, fields),
    String(row.override?.remark ?? "-"),
    formatDateTime(row.override?.updated_at),
    (
      <button
        className="account-action-button"
        onClick={() => openEdit(row)}
        type="button"
      >
        编辑
      </button>
    ),
  ]);

  async function handleQuery() {
    if (!selectedMonth) {
      notification.error("请选择月份");
      return;
    }

    setIsQuerying(true);
    setProgressVisible(true);
    setProgress(0);
    setLoadingText("正在查询考勤数据...");
    let current = 0;
    const interval = setInterval(() => {
      current += Math.floor(Math.random() * 20) + 10;
      if (current >= 95) current = 95;
      setProgress(current);
    }, 80);

    try {
      const query = new URLSearchParams({ month: selectedMonth });
      selectedIds.forEach((id) => query.append("emp_ids", String(id)));
      const payload = await apiRequest<AttendanceOverrideResponse>(`${endpointBase}?${query.toString()}`);
      
      clearInterval(interval);
      setProgress(100);
      setLoadingText("查询完成");
      await new Promise((resolve) => setTimeout(resolve, 300));

      const nextRows = Array.isArray(payload.rows) ? payload.rows : [];
      setRows(nextRows);
      setHasQueried(true);
      setEditingRow(null);
    } catch (caughtError) {
      clearInterval(interval);
      setRows([]);
      setHasQueried(true);
      notification.error(caughtError instanceof Error ? caughtError.message : "修正列表加载失败");
    } finally {
      setTimeout(() => setProgressVisible(false), 300);
      setIsQuerying(false);
    }
  }

  function handleMonthChange(val: string) {
    setSelectedMonth(val);
    setEditingRow(null);
  }

  function handleSelectionChange(ids: number[]) {
    setSelectedIds(ids);
    setEditingRow(null);
  }

  function openEdit(row: AttendanceOverrideRow) {
    setEditingRow(row);
  }

  function handleRowRefresh(nextRow: unknown) {
    const typedRow = nextRow as AttendanceOverrideRow;
    setRows((currentRows) =>
      currentRows.map((row) => (row.employee.id === typedRow.employee.id ? typedRow : row)),
    );
    setEditingRow((current) => (current && current.employee.id === typedRow.employee.id ? typedRow : current));
  }

  function handleDownload(kind: "template" | "export") {
    if (!selectedMonth) {
      notification.error("请选择月份");
      return;
    }
    window.location.assign(buildApiUrl(`${endpointBase}/${kind}?month=${encodeURIComponent(selectedMonth)}`));
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!selectedMonth) {
      notification.error("请选择月份");
      event.target.value = "";
      return;
    }
    try {
      setProgressVisible(true);
      setProgress(0);
      setLoadingText("正在上传并处理导入，请稍候...");
      let current = 0;
      const interval = setInterval(() => {
        current += Math.floor(Math.random() * 15) + 5;
        if (current >= 95) current = 95;
        setProgress(current);
      }, 150);

      const form = new FormData();
      form.append("month", selectedMonth);
      form.append("file", file);
      const result = await apiRequest<{
        success_count: number;
        skipped_count: number;
        failed_count: number;
        changed_count: number;
        errors?: string[];
      }>(`${endpointBase}/import`, {
        body: form,
        method: "POST",
      });
      clearInterval(interval);
      setProgress(100);
      setLoadingText("导入处理完成！");
      await new Promise((resolve) => setTimeout(resolve, 500));
      const summary = [
        `成功 ${result.success_count} 条`,
        `跳过 ${result.skipped_count} 条`,
        `失败 ${result.failed_count} 条`,
        `实际变更 ${result.changed_count} 条`,
      ];
      if (Array.isArray(result.errors) && result.errors.length) {
        summary.push("", result.errors.join("\n"));
      }
      const hasFailures = result.failed_count > 0 || (Array.isArray(result.errors) && result.errors.length > 0);
      // 导入结果含多行汇总与可能的错误明细，给更长的展示时间方便阅读
      (hasFailures ? notification.warning : notification.success)(summary.join("\n"), 20000);
      if (selectedIds.length) {
        await handleQuery();
      }
    } catch (caughtError) {
      notification.error(caughtError instanceof Error ? caughtError.message : "导入失败");
    } finally {
      setTimeout(() => setProgressVisible(false), 500);
      event.target.value = "";
    }
  }

  if (isLoading) {
    return <LoadingState filterFields={3} headers={tableHeaders.map((header) => typeof header === "string" ? header : typeof header.label === "string" ? header.label : "")} message={`正在准备${title}页面...`} variant="query-page" />;
  }

  if (!bootstrap) {
    return <ErrorState description={`${title}初始化失败`} title={`${title}初始化失败`} />;
  }

  return (
    <div className="query-page-shell attendance-override-page">
      <aside className="query-filter-rail">
        <div className="query-filter-heading">
          <h2>查询条件</h2>
        </div>
        <div className="query-filter-body">
          <div className="query-filter-field">
            <label className="form-label">{pickerLabel}</label>
            <EmployeePicker
              departments={bootstrap.departments}
              employees={bootstrap.employees}
              filterMode={filterMode}
              label={pickerButtonLabel}
              onChange={handleSelectionChange}
              selectedIds={selectedIds}
              showFieldChrome={false}
            />
          </div>

          <div className="query-filter-field">
            <MonthPicker onChange={handleMonthChange} value={selectedMonth} />
          </div>

          <div className="query-filter-field">
            <label className="form-label">主要操作</label>
            <div className="query-filter-actions">
              <button className="btn btn-primary" disabled={isQuerying} onClick={handleQuery} type="button">
                {isQuerying ? "查询中..." : "查询"}
              </button>
              <button
                className="btn btn-outline-secondary"
                onClick={() => setShowActionsModal(true)}
                type="button"
              >
                导入导出
              </button>
              <input ref={fileInputRef} accept=".xlsx" className="attendance-override-file-input" style={{ display: "none" }} onChange={handleImportFile} type="file" />
            </div>
            {lockNotice ? (
              <div className={`account-lock-notice${isLocked ? " is-locked" : ""}`} style={{ marginTop: "4px" }}>{lockNotice}</div>
            ) : null}
          </div>
        </div>
      </aside>

      <section className="query-workspace">
        <QueryProgressOverlay active={progressVisible} progress={progress} text={loadingText} />
        <QueryResultPanel>
          <QueryTable
            emptyText={hasQueried ? listEmptyHint : `请先查询${pickerLabel}和月份`}
            headers={tableHeaders}
            panelClassName="attendance-override-table-panel"
            rows={tableRows}
            tableClassName="attendance-override-table"
          />
        </QueryResultPanel>
      </section>

      {editingRow ? (
        <AttendanceOverrideCalendarModal
          editTitle={editTitle}
          employee={editingRow.employee}
          hasMonthlyOverride={Boolean(editingRow.override?.updated_at)}
          isLocked={isLocked}
          isManager={filterMode === "manager"}
          month={selectedMonth}
          onClose={() => setEditingRow(null)}
          onRowRefresh={handleRowRefresh}
        />
      ) : null}

      {showActionsModal ? (
        <div aria-label="导入导出" aria-modal="true" className="master-modal-backdrop attendance-override-actions-backdrop" role="dialog">
          <div className="master-modal attendance-override-actions-modal">
            <div className="master-modal-header">
              <div>
                <h2>导入导出</h2>
                <div className="attendance-override-edit-meta">选择需要执行的数据导出或导入操作</div>
              </div>
              <button aria-label="关闭" className="master-modal-close" onClick={() => setShowActionsModal(false)} type="button">
                ×
              </button>
            </div>
            <div className="master-modal-body attendance-override-actions-body">
              <button
                className="account-action-button account-action-button--primary attendance-override-actions-button"
                onClick={() => { handleDownload("export"); setShowActionsModal(false); }}
                type="button"
              >
                导出
              </button>
              <button
                className="account-action-button account-action-button--success attendance-override-actions-button"
                disabled={isLocked}
                onClick={() => { fileInputRef.current?.click(); setShowActionsModal(false); }}
                type="button"
              >
                导入
              </button>
              <button
                className="account-action-button attendance-override-actions-button"
                onClick={() => { handleDownload("template"); setShowActionsModal(false); }}
                type="button"
              >
                示例下载
              </button>
            </div>
            <div className="master-modal-footer">
              <button className="account-action-button" onClick={() => setShowActionsModal(false)} type="button">
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function pickDefaultMonth(accountSets: AccountSet[]): string {
  return accountSets.find((accountSet) => accountSet.is_active)?.month ?? accountSets[0]?.month ?? "";
}

function summarizeValues(values: OverrideValues | null, fields: FieldConfig[]): string {
  if (!values) {
    return "-";
  }
  const parts = fields
    .map((field) => {
      const value = values[field.key];
      if (value === null || value === undefined || value === "") {
        return null;
      }
      return `${field.label}：${String(value)}`;
    })
    .filter((item): item is string => Boolean(item));
  return parts.join("；") || "-";
}

function formatDateTime(value: unknown): string {
  return typeof value === "string" && value ? value.replace("T", " ").slice(0, 19) : "-";
}
