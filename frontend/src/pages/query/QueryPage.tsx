import { useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import { buildDownloadUrl, fetchHeaderRows, fetchObjectRows, fetchQueryBootstrap } from "../../api/query";
import EmployeePicker from "../../components/query/EmployeePicker";
import QueryResultPanel from "../../components/query/QueryResultPanel";
import QueryTable from "../../components/query/QueryTable";
import MultiSelectDropdown from "../../components/common/MultiSelectDropdown";
import type { QueryTableCellModalConfig } from "../../components/query/QueryTable";
import ErrorState from "../../components/feedback/ErrorState";
import LoadingState from "../../components/feedback/LoadingState";
import QueryProgressOverlay from "../../components/feedback/QueryProgressOverlay";
import AccountSetSelector from "../../components/query/AccountSetSelector";
import type { AccountSet, HeaderRowsResponse, QueryBootstrap } from "../../types/query";
import "./dashboard-shared.css";

type FieldType = "month" | "year" | "employees";
type PageKind = "headerRows" | "objectRows";

interface QueryOption {
  key: string;
  label: string;
  value: string;
}

interface QueryColumn {
  key: string;
  label: string;
  format?: (value: unknown, row: Record<string, unknown>) => string | number;
}

interface QueryPageProps {
  title: string;
  description: string;
  endpoint: string;
  exportPath?: string;
  templateExportPath?: string;
  kind: PageKind;
  fields: FieldType[];
  employeeFilterMode?: "all" | "manager" | "employee";
  options?: QueryOption[];
  columns?: QueryColumn[];
  defaultSelectedOptions?: Record<string, boolean>;
  prepareQuery?: (query: URLSearchParams, state: QueryState) => void;
  resolveColumns?: (state: QueryState) => QueryColumn[];
  transformHeaderRows?: (payload: HeaderRowsResponse, state: QueryState) => HeaderRowsResponse;
  transformObjectRows?: (rows: Record<string, unknown>[], state: QueryState) => Record<string, unknown>[];
  buildHeaderRowMeta?: (payload: HeaderRowsResponse, state: QueryState, bootstrap: QueryBootstrap) => unknown[];
  cellModal?: QueryTableCellModalConfig;
}

interface QueryState {
  selectedEmployeeIds: number[];
  selectedMonth: string;
  selectedYear: string;
  selectedOptions: Record<string, boolean>;
}

export default function QueryPage({
  title,
  description,
  endpoint,
  exportPath,
  templateExportPath,
  kind,
  fields,
  employeeFilterMode = "all",
  options = [],
  columns = [],
  defaultSelectedOptions = {},
  prepareQuery,
  resolveColumns,
  transformHeaderRows,
  transformObjectRows,
  buildHeaderRowMeta,
  cellModal,
}: QueryPageProps) {
  const [bootstrap, setBootstrap] = useState<QueryBootstrap | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isQuerying, setIsQuerying] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [selectedOptions, setSelectedOptions] = useState<Record<string, boolean>>(defaultSelectedOptions);
  const [tableHeaders, setTableHeaders] = useState<string[]>(["暂无数据"]);
  const [tableRows, setTableRows] = useState<Array<Array<string | number | null>>>([]);
  const [rawHeaderResult, setRawHeaderResult] = useState<HeaderRowsResponse | null>(null);
  const [rawObjectRows, setRawObjectRows] = useState<Record<string, unknown>[]>([]);
  const [tableRowMeta, setTableRowMeta] = useState<unknown[]>([]);
  const [hasQueried, setHasQueried] = useState(false);

  // 进度条控制状态
  const [progress, setProgress] = useState(0);
  const [progressVisible, setProgressVisible] = useState(false);
  const [loadingText, setLoadingText] = useState("正在为您查询考勤数据...");

  // 驱动极光流光进度条的自动递增与冲刺淡出逻辑
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    let fadeTimer: ReturnType<typeof setTimeout>;
    let resetTimer: ReturnType<typeof setTimeout>;

    if (isQuerying) {
      setProgressVisible(true);
      setProgress(10);
      timer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(timer);
            return 90;
          }
          const step = (100 - prev) * 0.15;
          return Math.min(90, Math.round(prev + step));
        });
      }, 150);
    } else if (progressVisible) {
      setProgress(100);
      fadeTimer = setTimeout(() => {
        setProgressVisible(false);
        resetTimer = setTimeout(() => {
          setProgress(0);
        }, 300); // 确保淡出动画结束后清零
      }, 400);
    }

    return () => {
      clearInterval(timer);
      clearTimeout(fadeTimer);
      clearTimeout(resetTimer);
    };
  }, [isQuerying]);

  useEffect(() => {
    let mounted = true;

    async function bootstrapPage() {
      try {
        const payload = await fetchQueryBootstrap();
        if (!mounted) {
          return;
        }
        setBootstrap(payload);
        if (fields.includes("month")) {
          setSelectedMonth(pickDefaultMonth(payload.account_sets));
        }
        setError("");
      } catch (caughtError) {
        if (!mounted) {
          return;
        }
        setError(caughtError instanceof ApiError ? caughtError.message : "查询页初始化失败");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    bootstrapPage();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasQueried) {
      return;
    }

    if (kind === "headerRows" && rawHeaderResult) {
      applyHeaderResult(rawHeaderResult, currentState());
      return;
    }

    if (kind === "objectRows") {
      applyObjectResult(rawObjectRows, currentState());
    }
  }, [hasQueried, kind, rawHeaderResult, rawObjectRows, selectedOptions]);

  function currentState(): QueryState {
    return {
      selectedEmployeeIds,
      selectedMonth,
      selectedYear,
      selectedOptions,
    };
  }

  function currentColumns(state: QueryState): QueryColumn[] {
    return resolveColumns ? resolveColumns(state) : columns;
  }

  function applyHeaderResult(payload: HeaderRowsResponse, state: QueryState) {
    const nextPayload = transformHeaderRows ? transformHeaderRows(payload, state) : payload;
    setTableHeaders(nextPayload.headers.length ? nextPayload.headers : ["暂无数据"]);
    setTableRows(Array.isArray(nextPayload.rows) ? nextPayload.rows : []);
    if (buildHeaderRowMeta && bootstrap) {
      setTableRowMeta(buildHeaderRowMeta(nextPayload, state, bootstrap));
    } else {
      setTableRowMeta([]);
    }
  }

  function applyObjectResult(payload: Record<string, unknown>[], state: QueryState) {
    const nextColumns = currentColumns(state);
    const nextRowsSource = transformObjectRows ? transformObjectRows(payload, state) : payload;
    setTableHeaders(nextColumns.length ? nextColumns.map((column) => column.label) : ["暂无数据"]);
    setTableRows(
      nextRowsSource.map((row) =>
        nextColumns.map((column) => {
          const value = row[column.key];
          return column.format ? column.format(value, row) : stringifyCell(value);
        }),
      ),
    );
    setTableRowMeta([]);
  }

  function buildQueryFromState(state: QueryState): URLSearchParams {
    const query = new URLSearchParams();

    if (fields.includes("month") && state.selectedMonth) {
      query.set("month", state.selectedMonth);
    }
    if (fields.includes("year") && state.selectedYear) {
      query.set("year", state.selectedYear);
    }
    if (fields.includes("employees")) {
      state.selectedEmployeeIds.forEach((employeeId) => query.append("emp_ids", String(employeeId)));
    }

    options.forEach((option) => {
      if (state.selectedOptions[option.key]) {
        query.set(option.key, option.value);
      }
    });

    prepareQuery?.(query, state);
    return query;
  }

  async function handleQuery() {
    setLoadingText("正在为您查询考勤数据...");
    setIsQuerying(true);
    setError("");

    try {
      const query = buildQueryFromState(currentState());
      if (kind === "headerRows") {
        const payload = await fetchHeaderRows(endpoint, query);
        setRawHeaderResult(payload);
        applyHeaderResult(payload, currentState());
      } else {
        const payload = await fetchObjectRows<Record<string, unknown>>(endpoint, query);
        setRawObjectRows(payload);
        applyObjectResult(payload, currentState());
      }
      setHasQueried(true);
    } catch (caughtError) {
      const nextError = caughtError instanceof ApiError ? caughtError.message : "查询失败，请稍后重试";
      setError(nextError);
      setHasQueried(false);
      setRawHeaderResult(null);
      setRawObjectRows([]);
      setTableHeaders(["暂无数据"]);
      setTableRows([]);
      setTableRowMeta([]);
    } finally {
      setIsQuerying(false);
    }
  }

  function handleDownload(path: string) {
    setLoadingText("正在为您生成并下载报表...");
    setIsQuerying(true);
    const query = buildQueryFromState(currentState());
    window.location.href = buildDownloadUrl(path, query);
    setTimeout(() => {
      setIsQuerying(false);
    }, 2000);
  }

  if (isLoading) {
    return <LoadingState message="正在准备查询页..." />;
  }

  if (error && !bootstrap) {
    return <ErrorState description={error} title="查询页初始化失败" />;
  }

  if (!bootstrap) {
    return <ErrorState description={`未能读取${title}基础数据。`} />;
  }

  const queryTableEmptyText = hasQueried ? "暂无数据" : "请点击查询";
  const employeeFieldLabel = employeeFilterMode === "manager" ? "管理人员" : "员工";
  const employeePickerLabel = employeeFilterMode === "manager" ? "管理人员范围" : "员工范围";

  return (
    <div className="query-page-shell employee-dashboard-page">
      {/* 极光背景流动球 */}
      <div className="qh-glow-sphere sphere-1" />
      <div className="qh-glow-sphere sphere-2" />
      <div className="qh-glow-sphere sphere-3" />

      <aside className="query-filter-rail">
        <div className="query-filter-heading">
          <span className="query-filter-kicker">Query Filters</span>
          <h2>查询条件</h2>
          <p>{description}</p>
        </div>

        <div className="query-filter-body">
          {fields.includes("employees") ? (
            <div className="query-filter-field">
              <label className="form-label">{employeeFieldLabel}</label>
              <EmployeePicker
                departments={bootstrap.departments}
                employees={bootstrap.employees}
                filterMode={employeeFilterMode}
                label={employeePickerLabel}
                onChange={(ids) => {
                  setSelectedEmployeeIds(ids);
                  setHasQueried(false);
                }}
                selectedIds={selectedEmployeeIds}
                showFieldChrome={false}
              />
            </div>
          ) : null}

          {fields.includes("month") ? (
            <div className="query-filter-field">
              <AccountSetSelector
                accountSets={bootstrap.account_sets}
                compact
                label="账套"
                onChange={(nextMonth) => {
                  setSelectedMonth(nextMonth);
                  setHasQueried(false);
                }}
                value={selectedMonth}
              />
            </div>
          ) : null}

          {fields.includes("year") ? (
            <div className="query-filter-field">
              <label className="form-label">年份</label>
              <input
                className="form-control"
                onChange={(event) => {
                  setSelectedYear(event.target.value);
                  setHasQueried(false);
                }}
                type="number"
                value={selectedYear}
              />
            </div>
          ) : null}

          {options.length ? (
            <div className="query-filter-field">
              <label className="form-label">显示选项</label>
              <MultiSelectDropdown
                onChange={setSelectedOptions}
                options={options}
                value={selectedOptions}
              />
            </div>
          ) : null}

          <div className="query-filter-actions">
            <button className={`btn btn-primary${isQuerying ? " is-loading" : ""}`} disabled={isQuerying} onClick={handleQuery} type="button">
              {isQuerying ? "查询中..." : "查询"}
            </button>
            {exportPath ? (
              <button className="btn btn-outline-success" onClick={() => handleDownload(exportPath)} type="button">
                下载XLSX
              </button>
            ) : null}
            {templateExportPath ? (
              <button className="btn btn-outline-secondary" onClick={() => handleDownload(templateExportPath)} type="button">
                按模板导出
              </button>
            ) : null}
          </div>
        </div>

        {error ? <p className="legacy-inline-error">{error}</p> : null}
      </aside>

      <section className="query-workspace">
        <QueryProgressOverlay active={progressVisible} progress={progress} text={loadingText} />
        <QueryResultPanel>
          <QueryTable
            cellModal={cellModal}
            emptyText={queryTableEmptyText}
            headers={tableHeaders}
            isRefreshing={isQuerying}
            rowMeta={tableRowMeta}
            rows={tableRows}
          />
        </QueryResultPanel>
      </section>
    </div>
  );
}

function pickDefaultMonth(accountSets: AccountSet[]): string {
  return accountSets.find((accountSet) => accountSet.is_active)?.month ?? accountSets[0]?.month ?? "";
}

function stringifyCell(value: unknown): string | number {
  if (typeof value === "number") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.length ? JSON.stringify(value) : "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
