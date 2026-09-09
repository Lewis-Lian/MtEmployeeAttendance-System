import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

import { fetchAccountSets } from "../../api/admin";
import { apiRequest, buildApiUrl } from "../../api/client";
import { fetchQueryBootstrap } from "../../api/query";
import ErrorState from "../feedback/ErrorState";
import LoadingState from "../feedback/LoadingState";
import QueryProgressOverlay from "../feedback/QueryProgressOverlay";
import EmployeePicker from "../query/EmployeePicker";
import QueryResultPanel from "../query/QueryResultPanel";
import QueryTable from "../query/QueryTable";
import YearPicker from "../common/YearPicker";
import { useNotification } from "../feedback/Notification";
import type { QueryBootstrap } from "../../types/query";

interface MonthField {
  key: string;
  label: string;
}

interface SummaryColumn {
  key: string;
  label: string;
  render: (row: Record<string, unknown>) => string;
}

interface ManagerMonthStatPageProps {
  title: string;
  endpointBase: "/api/admin/manager-overtime" | "/api/admin/manager-annual-leave";
  editTitle: string;
  remainingLabel: string;
  monthFields: MonthField[];
  summaryColumns: SummaryColumn[];
}

type ManagerStatRow = Record<string, unknown> & {
  emp_id: number;
  dept_name?: string;
  name?: string;
  remaining?: number | string | null;
  remark?: string;
};

type ColumnState = "editable" | "locked" | "missing_account_set";

export default function ManagerMonthStatPage({
  title,
  endpointBase,
  editTitle,
  remainingLabel,
  monthFields,
  summaryColumns,
}: ManagerMonthStatPageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [bootstrap, setBootstrap] = useState<QueryBootstrap | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [rows, setRows] = useState<ManagerStatRow[]>([]);
  const notification = useNotification();
  const [isQuerying, setIsQuerying] = useState(false);
  const [editingRow, setEditingRow] = useState<ManagerStatRow | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editRemark, setEditRemark] = useState("");
  const [columnStates, setColumnStates] = useState<Record<string, ColumnState>>({});
  const [hasQueried, setHasQueried] = useState(false);
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [progressVisible, setProgressVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const payload = await fetchQueryBootstrap();
        setBootstrap(payload);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "后台数据加载失败");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const managerEmployees = useMemo(
    () => bootstrap?.employees.filter((employee) => employee.is_manager) ?? [],
    [bootstrap],
  );
  const tableHeaders = [
    "部门",
    "姓名",
    ...summaryColumns.map((column) => column.label),
    "备注",
    { label: "操作", sortable: false as const },
  ];
  const tableRows = rows.map((row) => [
    String(row.dept_name ?? ""),
    String(row.name ?? ""),
    ...summaryColumns.map((column) => column.render(row)),
    String(row.remark ?? ""),
    <button className="account-action-button" onClick={() => openEdit(row)} type="button">编辑</button>,
  ]);

  async function loadRows() {
    if (!year) {
      notification.error("请选择年份");
      return;
    }

    setIsQuerying(true);
    setProgressVisible(true);
    setProgress(0);
    setLoadingText("正在查询统计数据...");
    let current = 0;
    const interval = setInterval(() => {
      current += Math.floor(Math.random() * 20) + 10;
      if (current >= 95) current = 95;
      setProgress(current);
    }, 80);

    try {
      const query = new URLSearchParams({ year, emp_ids: selectedEmployeeIds.join(",") });
      const [nextRows, states] = await Promise.all([
        apiRequest<ManagerStatRow[]>(`${endpointBase}/records?${query.toString()}`),
        buildColumnStates(year, monthFields.map((field) => field.key)),
      ]);
      
      clearInterval(interval);
      setProgress(100);
      setLoadingText("查询完成");
      await new Promise((resolve) => setTimeout(resolve, 300));

      setRows(Array.isArray(nextRows) ? nextRows : []);
      setColumnStates(states);
      setHasQueried(true);
      setEditingRow(null);
    } catch (error) {
      clearInterval(interval);
      setRows([]);
      setHasQueried(true);
      notification.error(error instanceof Error ? error.message : "后台数据加载失败");
    } finally {
      setTimeout(() => setProgressVisible(false), 300);
      setIsQuerying(false);
    }
  }

  function openEdit(row: ManagerStatRow) {
    setEditingRow(row);
    setEditValues(
      Object.fromEntries(monthFields.map((field) => [field.key, normalizeValue(row[field.key])])),
    );
    setEditRemark(String(row.remark ?? ""));
  }

  async function saveEdit() {
    if (!editingRow) {
      return;
    }

    const payload: Record<string, unknown> = {
      emp_id: editingRow.emp_id,
      year,
      remark: editRemark,
    };
    monthFields.forEach((field) => {
      payload[field.key] = editValues[field.key] ?? "";
    });

    try {
      await apiRequest(`${endpointBase}/records`, {
        body: payload,
        method: "PUT",
      });
      await loadRows();
    } catch (error) {
      notification.error(error instanceof Error ? error.message : "保存失败");
    }
  }

  async function submitImport(event: ChangeEvent<HTMLInputElement>) {
    const importFile = event.target.files?.[0];
    if (!importFile?.name) {
      return;
    }
    if (!importFile.name.toLowerCase().endsWith(".xlsx")) {
      notification.error("仅支持 .xlsx 文件");
      event.target.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("year", year);
    formData.append("file", importFile);

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

      const result = await apiRequest<{
        imported?: number;
        warning?: string;
        error_count?: number;
        errors?: string[];
      }>(`${endpointBase}/import`, {
        body: formData,
        method: "POST",
      });
      clearInterval(interval);
      setProgress(100);
      setLoadingText("导入处理完成！");
      await new Promise((resolve) => setTimeout(resolve, 500));
      const warnings = result.warning ? `\n${result.warning}` : "";
      const errors =
        result.error_count && result.errors?.length
          ? `\n失败 ${result.error_count} 条：\n${result.errors.join("\n")}`
          : "";
      if (selectedEmployeeIds.length) {
        await loadRows();
      }
      if (warnings || errors) {
        notification.error(`已导入 ${String(result.imported ?? 0)} 人${warnings}${errors}`);
      } else {
        notification.success(`导入成功，共处理 ${result.imported ?? 0} 条记录`);
      }
    } catch (error) {
      notification.error(error instanceof Error ? error.message : "导入失败");
    } finally {
      setTimeout(() => setProgressVisible(false), 500);
      event.target.value = "";
    }
  }

  function handleExport() {
    if (!year) {
      notification.error("请选择年份");
      return;
    }
    window.location.assign(buildApiUrl(`${endpointBase}/export?year=${encodeURIComponent(year)}`));
  }

  if (isLoading) {
    return <LoadingState filterFields={3} headers={tableHeaders.map((header) => typeof header === "string" ? header : typeof header.label === "string" ? header.label : "")} message={`正在准备${title}页面...`} variant="query-page" />;
  }

  if (loadError || !bootstrap) {
    return <ErrorState title={`${title}加载失败`} description={loadError || "后台数据加载失败"} />;
  }

  return (
    <div className="query-page-shell manager-month-stat-page">
      <aside className="query-filter-rail">
        <div className="query-filter-heading">
          <h2>查询条件</h2>
        </div>
        <div className="query-filter-body">
          <div className="query-filter-field">
            <label className="form-label">管理人员</label>
            <EmployeePicker
              departments={bootstrap.departments}
              employees={managerEmployees}
              filterMode="manager"
              label="管理人员范围"
              onChange={setSelectedEmployeeIds}
              selectedIds={selectedEmployeeIds}
              showFieldChrome={false}
            />
          </div>
          <div className="query-filter-field">
            <label className="form-label">年份</label>
            <YearPicker
              value={year}
              onChange={setYear}
            />
          </div>
          <div className="query-filter-field">
            <label className="form-label">主要操作</label>
            <div className="query-filter-actions">
              <button className="btn btn-primary" onClick={loadRows} type="button">
                查询
              </button>
              <button className="btn btn-outline-secondary" onClick={() => setShowActionsModal(true)} type="button">
                导入导出
              </button>
              <input ref={fileInputRef} accept=".xlsx" className="attendance-override-file-input" onChange={submitImport} type="file" />
            </div>
            <div className="account-lock-notice" style={{ marginTop: "4px" }}>{buildLockNotice(year, columnStates)}</div>
          </div>
        </div>
      </aside>

      <section className="query-workspace">
        <QueryProgressOverlay active={progressVisible} progress={progress} text={loadingText} />
        <QueryResultPanel>
          <QueryTable
            emptyText={isQuerying ? "正在加载..." : hasQueried ? "当前条件无数据" : "请先查询管理人员和年份"}
            headers={tableHeaders}
            panelClassName="manager-month-stat-table-panel"
            rows={tableRows}
            tableClassName="manager-month-stat-table"
          />
        </QueryResultPanel>
      </section>

      {editingRow ? (
        <div className="master-modal-backdrop">
          <div className="master-modal manager-month-stat-edit-modal">
            <div className="master-modal-header">
              <div>
                <h2>{editTitle}</h2>
                <div className="attendance-override-edit-meta">
                  {String(editingRow.name ?? "")} / {year}
                </div>
              </div>
              <button aria-label="关闭" className="master-modal-close" onClick={() => setEditingRow(null)} type="button">
                ×
              </button>
            </div>
            <div className="master-modal-body">
              <div className="attendance-override-edit-table-wrap">
                <table className="legacy-table attendance-override-edit-table manager-month-stat-edit-table">
                  <thead>
                    <tr>
                      {monthFields.map((field) => (
                        <th className="legacy-table-head-cell" key={field.key}>
                          {field.label}
                        </th>
                      ))}
                      <th className="legacy-table-head-cell">{remainingLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {monthFields.map((field) => (
                        <td className="legacy-table-body-cell" key={field.key}>
                          <input
                            className="account-input attendance-override-edit-input"
                            disabled={columnStates[field.key] === "locked"}
                            onChange={(event) =>
                              setEditValues((current) => ({ ...current, [field.key]: event.target.value }))
                            }
                            value={editValues[field.key] ?? ""}
                          />
                        </td>
                      ))}
                      <td className="legacy-table-body-cell">{normalizeValue(editingRow.remaining)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <label className="account-field">
                <span className="account-field-label">备注</span>
                <textarea
                  className="account-input attendance-override-edit-remark"
                  onChange={(event) => setEditRemark(event.target.value)}
                  rows={3}
                  value={editRemark}
                />
              </label>
            </div>
            <div className="master-modal-footer">
              <button className="account-action-button" onClick={() => setEditingRow(null)} type="button">
                取消
              </button>
              <button className="account-action-button account-action-button--primary" onClick={saveEdit} type="button">
                保存修改
              </button>
            </div>
          </div>
        </div>
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
                onClick={() => { handleExport(); setShowActionsModal(false); }}
                type="button"
              >
                导出
              </button>
              <button
                className="account-action-button account-action-button--success attendance-override-actions-button"
                onClick={() => { fileInputRef.current?.click(); setShowActionsModal(false); }}
                type="button"
              >
                导入
              </button>
              <a className="account-action-button attendance-override-actions-button" href={buildApiUrl(`${endpointBase}/template`)}>
                示例下载
              </a>
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

function normalizeValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

async function buildColumnStates(year: string, keys: string[]): Promise<Record<string, ColumnState>> {
  const accountSets = await fetchAccountSets();
  const nextStates: Record<string, ColumnState> = {};
  keys.forEach((key) => {
    const month = key === "prev_dec" ? `${Number(year) - 1}-12` : `${year}-${String(Number(key.slice(1))).padStart(2, "0")}`;
    const matched = accountSets.find((row) => row.month === month);
    if (!matched) {
      nextStates[key] = "missing_account_set";
      return;
    }
    nextStates[key] = matched.is_locked ? "locked" : "editable";
  });
  return nextStates;
}

function buildLockNotice(year: string, states: Record<string, ColumnState>): string {
  const locked: string[] = [];
  Object.entries(states).forEach(([key, state]) => {
    const month = key === "prev_dec" ? `${Number(year) - 1}-12` : `${year}-${String(Number(key.slice(1))).padStart(2, "0")}`;
    if (state === "locked") {
      locked.push(month);
    }
  });
  const parts: string[] = [];
  if (locked.length) {
    parts.push(`已锁定：${locked.join("、")}`);
  }
  return parts.join("；");
}
