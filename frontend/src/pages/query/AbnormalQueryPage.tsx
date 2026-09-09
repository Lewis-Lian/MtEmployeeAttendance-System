import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { buildDownloadUrl, fetchObjectRows, fetchQueryBootstrap } from "../../api/query";
import EmployeePicker from "../../components/query/EmployeePicker";
import QueryResultPanel from "../../components/query/QueryResultPanel";
import QueryTable from "../../components/query/QueryTable";
import MultiSelectDropdown from "../../components/common/MultiSelectDropdown";
import ErrorState from "../../components/feedback/ErrorState";
import LoadingState from "../../components/feedback/LoadingState";
import QueryProgressOverlay from "../../components/feedback/QueryProgressOverlay";
import AccountSetSelector from "../../components/query/AccountSetSelector";
import type { QueryBootstrap } from "../../types/query";
import "./dashboard-shared.css";

interface AbnormalQueryRow {
  dept_name: string;
  emp_no: string;
  name: string;
  abnormal_count: number;
}

interface AbnormalRowMeta {
  employeeId: number | null;
  employeeName: string;
  month: string;
}

interface PunchRecordRow {
  dept_name?: string;
  name?: string;
  date: string;
  raw_punch_data?: string;
  punch_count?: number | string;
  exception_reason?: string;
}

export default function AbnormalQueryPage() {
  const [bootstrap, setBootstrap] = useState<QueryBootstrap | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isQuerying, setIsQuerying] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [showEmpNo, setShowEmpNo] = useState(true);
  const [rawRows, setRawRows] = useState<AbnormalQueryRow[]>([]);
  const [tableHeaders, setTableHeaders] = useState<string[]>(["暂无数据"]);
  const [tableRows, setTableRows] = useState<Array<Array<string | number | null>>>([]);
  const [tableRowMeta, setTableRowMeta] = useState<AbnormalRowMeta[]>([]);
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
        setSelectedMonth(payload.account_sets.find((accountSet) => accountSet.is_active)?.month ?? payload.account_sets[0]?.month ?? "");
        setError("");
      } catch (caughtError) {
        if (!mounted) {
          return;
        }
        setError(caughtError instanceof ApiError ? caughtError.message : "员工异常查询页初始化失败");
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

  const queryTableEmptyText = hasQueried ? "暂无数据" : "请点击查询";

  function buildQuery() {
    const query = new URLSearchParams();
    if (selectedMonth) {
      query.set("month", selectedMonth);
    }
    selectedEmployeeIds.forEach((employeeId) => query.append("emp_ids", String(employeeId)));
    return query;
  }

  function buildTablePayload(rows: AbnormalQueryRow[]) {
    const headers = showEmpNo ? ["部门名称", "人员编号", "人员姓名", "异常考勤次数"] : ["部门名称", "人员姓名", "异常考勤次数"];
    const mappedRows = rows.map((row) =>
      showEmpNo
        ? [row.dept_name, row.emp_no, row.name, row.abnormal_count]
        : [row.dept_name, row.name, row.abnormal_count],
    );
    return { headers, rows: mappedRows };
  }

  useEffect(() => {
    if (!hasQueried) {
      return;
    }
    const nextTable = buildTablePayload(rawRows);
    setTableHeaders(nextTable.headers);
    setTableRows(nextTable.rows);
  }, [hasQueried, rawRows, showEmpNo]);

  async function handleQuery() {
    if (!bootstrap) {
      setError("员工异常查询页基础数据尚未就绪");
      return;
    }

    setLoadingText("正在为您查询考勤数据...");
    setIsQuerying(true);
    setError("");

    try {
      const payload = await fetchObjectRows<AbnormalQueryRow>("/api/query/abnormal", buildQuery());
      setRawRows(payload);
      const nextTable = buildTablePayload(payload);
      setTableHeaders(nextTable.headers);
      setTableRows(nextTable.rows);
      setTableRowMeta(buildAbnormalRowMeta(payload, bootstrap.employees, selectedMonth));
      setHasQueried(true);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "查询失败，请稍后重试");
      setRawRows([]);
      setHasQueried(false);
      setTableHeaders(["暂无数据"]);
      setTableRows([]);
      setTableRowMeta([]);
    } finally {
      setIsQuerying(false);
    }
  }

  function handleDownload() {
    setLoadingText("正在为您生成并下载报表...");
    setIsQuerying(true);
    window.location.href = buildDownloadUrl("/api/query/abnormal/export", buildQuery());
    setTimeout(() => {
      setIsQuerying(false);
    }, 2000);
  }

  if (isLoading) {
    return <LoadingState filterFields={3} headers={["部门名称", "人员编号", "人员姓名", "异常考勤次数"]} message="正在准备员工异常查询页..." variant="query-page" />;
  }

  if (error && !bootstrap) {
    return <ErrorState description={error} title="员工异常查询页初始化失败" />;
  }

  if (!bootstrap) {
    return <ErrorState description="未能读取员工异常查询页基础数据。" />;
  }

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
          <p>按员工范围和账套查询异常考勤汇总。</p>
        </div>

        <div className="query-filter-body">
          <div className="query-filter-field">
            <label className="form-label">员工</label>
            <EmployeePicker
              departments={bootstrap.departments}
              employees={bootstrap.employees}
              filterMode="employee"
              onChange={(ids) => {
                setSelectedEmployeeIds(ids);
                setHasQueried(false);
              }}
              selectedIds={selectedEmployeeIds}
              showFieldChrome={false}
            />
          </div>

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

          <div className="query-filter-field">
            <label className="form-label">显示选项</label>
            <MultiSelectDropdown
              onChange={(next) => {
                setShowEmpNo(Boolean(next.show_emp_no));
              }}
              options={[{ key: "show_emp_no", label: "人员编号" }]}
              value={{ show_emp_no: showEmpNo }}
            />
          </div>

          <div className="query-filter-actions">
            <button className={`btn btn-primary${isQuerying ? " is-loading" : ""}`} disabled={isQuerying} onClick={handleQuery} type="button">
              {isQuerying ? "查询中..." : "查询"}
            </button>
            <button className="btn btn-outline-success" onClick={handleDownload} type="button">
              下载XLSX
            </button>
          </div>
        </div>

        {error ? <p className="legacy-inline-error">{error}</p> : null}
      </aside>

      <section className="query-workspace">
        <QueryProgressOverlay active={progressVisible} progress={progress} text={loadingText} />
        <QueryResultPanel>
          <QueryTable
            cellModal={{
              getModal: ({ headerLabel, rowMeta }) => {
                const meta = rowMeta as AbnormalRowMeta | undefined;
                if (headerLabel !== "异常考勤次数" || !meta?.employeeId || !meta.month) {
                  return null;
                }
                return {
                  title: `${meta.employeeName} ${meta.month} 异常打卡时间`,
                  triggerLabel: `查看${meta.employeeName}在 ${meta.month} 的异常打卡时间`,
                  loadContent: async () => {
                    const query = new URLSearchParams();
                    query.set("month", meta.month);
                    query.append("emp_ids", String(meta.employeeId));
                    const rows = await fetchObjectRows<PunchRecordRow>("/api/query/punch-records", query);
                    return renderAbnormalPunchModal(rows);
                  },
                };
              },
            }}
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

function buildAbnormalRowMeta(rows: AbnormalQueryRow[], employees: QueryBootstrap["employees"], month: string): AbnormalRowMeta[] {
  return rows.map((row) => {
    const employee = employees.find((item) => item.emp_no === row.emp_no);
    return {
      employeeId: employee?.id ?? null,
      employeeName: row.name || employee?.name || row.emp_no,
      month,
    };
  });
}

function renderAbnormalPunchModal(rows: PunchRecordRow[]) {
  const abnormalRows = rows.filter((row) => {
    const punchCount = Number(row.punch_count ?? 0);
    if (punchCount !== 1 && punchCount !== 3) {
      return false;
    }
    return Boolean(String(row.raw_punch_data || "").trim());
  });

  if (!abnormalRows.length) {
    return <p>当前月份暂无异常打卡记录。</p>;
  }

  return <AbnormalPunchModalTable rows={abnormalRows} />;
}

function AbnormalPunchModalTable({ rows }: { rows: PunchRecordRow[] }) {
  const tableWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = tableWrapRef.current;
    if (!container) {
      return undefined;
    }
    const activeContainer = container;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;

    function handleMouseDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase() ?? "";
      if (["input", "select", "button", "a", "label", "textarea"].includes(tagName)) {
        return;
      }

      isDragging = true;
      startX = event.clientX;
      startY = event.clientY;
      scrollLeft = activeContainer.scrollLeft;
      scrollTop = activeContainer.scrollTop;
      activeContainer.classList.add("is-dragging");
    }

    function handleMouseMove(event: MouseEvent) {
      if (!isDragging) {
        return;
      }

      activeContainer.scrollLeft = scrollLeft - (event.clientX - startX);
      activeContainer.scrollTop = scrollTop - (event.clientY - startY);
    }

    function handleMouseUp() {
      if (!isDragging) {
        return;
      }

      isDragging = false;
      activeContainer.classList.remove("is-dragging");
    }

    activeContainer.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      activeContainer.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  return (
    <div className="legacy-table-wrap" ref={tableWrapRef} style={{ maxHeight: "60vh", overflow: "auto" }}>
      <table className="legacy-table">
        <thead>
          <tr>
            <th className="legacy-table-head-cell"><div className="master-static-head">序号</div></th>
            <th className="legacy-table-head-cell"><div className="master-static-head">部门</div></th>
            <th className="legacy-table-head-cell"><div className="master-static-head">姓名</div></th>
            <th className="legacy-table-head-cell"><div className="master-static-head">日期</div></th>
            <th className="legacy-table-head-cell"><div className="master-static-head">原始打卡数据</div></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.date}-${index}`}>
              <td className="legacy-table-body-cell">{index + 1}</td>
              <td className="legacy-table-body-cell">{row.dept_name || ""}</td>
              <td className="legacy-table-body-cell">{row.name || ""}</td>
              <td className="legacy-table-body-cell">{row.date || ""}</td>
              <td className="legacy-table-body-cell">{row.raw_punch_data || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
