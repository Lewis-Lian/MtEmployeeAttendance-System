import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { ApiError } from "../../api/client";
import { buildDownloadUrl, fetchHeaderRows, fetchObjectRows, fetchQueryBootstrap } from "../../api/query";
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

interface DashboardRowMeta {
  employeeId: number | null;
  employeeName: string;
  month: string;
}

interface PunchRecordRow {
  dept_name?: string;
  name?: string;
  date: string;
  raw_punch_data?: string;
}

interface LeaveRecordRow {
  dept_name?: string;
  name?: string;
  leave_type?: string;
  start_time: string;
  end_time: string;
  duration?: number | string;
  reason?: string;
}

const LEAVE_MODAL_HEADER_MAP: Record<string, string> = {
  "病假（次数）": "病假",
  "病假时长（天）": "病假",
  "工伤（次数）": "工伤",
  "工伤时长（天）": "工伤",
  "丧假（次数）": "丧假",
  "丧假时长（天）": "丧假",
  "事假（次数）": "事假",
  "事假时长（天）": "事假",
  "补休（调休）(次)": "补休（调休）",
  "补休（调休）(天)": "补休（调休）",
  "婚假（次）": "婚假",
  "婚假（天）": "婚假",
};

export default function EmployeeDashboardPage() {
  const [bootstrap, setBootstrap] = useState<QueryBootstrap | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isQuerying, setIsQuerying] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [showLeaveCounts, setShowLeaveCounts] = useState(false);
  const [showLeaveDurations, setShowLeaveDurations] = useState(false);
  const [showActualAttendanceDays, setShowActualAttendanceDays] = useState(false);
  const [tableHeaders, setTableHeaders] = useState<string[]>(["暂无数据"]);
  const [tableRows, setTableRows] = useState<Array<Array<string | number | null>>>([]);
  const [tableRowMeta, setTableRowMeta] = useState<DashboardRowMeta[]>([]);
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
        setError(caughtError instanceof ApiError ? caughtError.message : "员工考勤数据查询页初始化失败");
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
    if (showLeaveCounts) {
      query.set("show_leave_counts", "1");
    }
    if (showLeaveDurations) {
      query.set("show_leave_durations", "1");
    }
    if (showActualAttendanceDays) {
      query.set("show_actual_attendance_days", "1");
    }
    return query;
  }

  async function handleQuery() {
    if (!bootstrap) {
      setError("员工考勤数据查询页基础数据尚未就绪");
      return;
    }

    setLoadingText("正在为您查询考勤数据...");
    setIsQuerying(true);
    setError("");

    try {
      const payload = await fetchHeaderRows("/api/query/employee-dashboard", buildQuery());
      setTableHeaders(payload.headers.length ? payload.headers : ["暂无数据"]);
      setTableRows(payload.rows);
      setTableRowMeta(buildDashboardRowMeta(payload.headers, payload.rows, bootstrap.employees, selectedMonth));
      setHasQueried(true);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "查询失败，请稍后重试");
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
    window.location.href = buildDownloadUrl("/api/query/employee-dashboard/export", buildQuery());
    setTimeout(() => {
      setIsQuerying(false);
    }, 2000);
  }

  if (isLoading) {
    return <LoadingState message="正在准备员工考勤数据查询页..." variant="table" />;
  }

  if (error && !bootstrap) {
    return <ErrorState description={error} title="员工考勤数据查询页初始化失败" />;
  }

  if (!bootstrap) {
    return <ErrorState description="未能读取员工考勤数据查询页基础数据。" />;
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
          <p>按员工范围、账套和显示列模式组合查询。</p>
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
              showFieldChrome={false}
              selectedIds={selectedEmployeeIds}
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
            <label className="form-label">显示选项</label>
            <MultiSelectDropdown
              onChange={(next) => {
                setShowLeaveCounts(Boolean(next.show_leave_counts));
                setShowLeaveDurations(Boolean(next.show_leave_durations));
                setShowActualAttendanceDays(Boolean(next.show_actual_attendance_days));
              }}
              options={[
                { key: "show_leave_counts", label: "请假次数" },
                { key: "show_leave_durations", label: "请假时长" },
                { key: "show_actual_attendance_days", label: "打卡天数" },
              ]}
              value={{
                show_leave_counts: showLeaveCounts,
                show_leave_durations: showLeaveDurations,
                show_actual_attendance_days: showActualAttendanceDays,
              }}
            />
          </div>

          <div className="query-filter-actions">
            <button className="btn btn-primary" disabled={isQuerying} onClick={handleQuery} type="button">
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
            isRefreshing={isQuerying}
            cellModal={{
              getModal: ({ headerLabel, rowMeta }) => {
                const meta = rowMeta as DashboardRowMeta | undefined;
                if (!meta?.employeeId || !meta.month) {
                  return null;
                }
                if (headerLabel === "考勤天数") {
                  return {
                    title: `${meta.employeeName} ${meta.month} 原始刷卡记录`,
                    triggerLabel: `查看${meta.employeeName}在 ${meta.month} 的原始刷卡记录`,
                    loadContent: async () => {
                      const query = new URLSearchParams();
                      query.set("month", meta.month);
                      query.append("emp_ids", String(meta.employeeId));
                      const rows = await fetchObjectRows<PunchRecordRow>("/api/query/punch-records", query);
                      return renderPunchRecordModal(rows, meta.employeeId, meta.month);
                    },
                  };
                }

                const leaveType = LEAVE_MODAL_HEADER_MAP[headerLabel];
                if (!leaveType) {
                  return null;
                }
                return {
                  title: `${meta.employeeName} ${meta.month} ${leaveType}明细`,
                  triggerLabel: `查看${meta.employeeName}在 ${meta.month} 的${leaveType}明细`,
                  loadContent: async () => {
                    const query = new URLSearchParams();
                    query.set("month", meta.month);
                    query.set("leave_type", leaveType);
                    query.append("emp_ids", String(meta.employeeId));
                    const rows = await fetchObjectRows<LeaveRecordRow>("/api/query/leave-records", query);
                    return renderLeaveRecordModal(rows, meta.employeeId, meta.month, leaveType);
                  },
                };
              },
            }}
            emptyText={queryTableEmptyText}
            headers={tableHeaders}
            rowMeta={tableRowMeta}
            rows={tableRows}
          />
        </QueryResultPanel>
      </section>
    </div>
  );
}

function buildDashboardRowMeta(
  headers: string[],
  rows: Array<Array<string | number | null>>,
  employees: QueryBootstrap["employees"],
  month: string,
): DashboardRowMeta[] {
  const empNoIndex = headers.indexOf("人员编号");
  const nameIndex = headers.indexOf("人员名称");
  return rows.map((row) => {
    const empNo = empNoIndex >= 0 ? String(row[empNoIndex] ?? "").trim() : "";
    const employeeName = nameIndex >= 0 ? String(row[nameIndex] ?? "").trim() : "";
    const employee = employees.find((item) => item.emp_no === empNo);
    return {
      employeeId: employee?.id ?? null,
      employeeName: employeeName || employee?.name || empNo,
      month,
    };
  });
}

function renderPunchRecordModal(rows: PunchRecordRow[], employeeId: number | null, month: string) {
  if (!rows.length) {
    return <p>当前月份暂无原始刷卡记录。</p>;
  }

  return <PunchRecordModalTable rows={rows} employeeId={employeeId} month={month} />;
}

function renderLeaveRecordModal(rows: LeaveRecordRow[], employeeId: number | null, month: string, leaveType: string) {
  if (!rows.length) {
    return <p>当前月份暂无{leaveType}明细。</p>;
  }

  return <LeaveRecordModalTable rows={rows} employeeId={employeeId} leaveType={leaveType} month={month} />;
}

function useDragScroll(containerRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const container = containerRef.current;
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
  }, [containerRef]);
}

function PunchRecordModalTable({
  rows,
  employeeId,
  month,
}: {
  rows: PunchRecordRow[];
  employeeId: number | null;
  month: string;
}) {
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  useDragScroll(tableWrapRef);

  function handleDownload() {
    if (!employeeId || !month) {
      return;
    }
    const query = new URLSearchParams();
    query.set("month", month);
    query.append("emp_ids", String(employeeId));
    window.location.href = buildDownloadUrl("/api/query/punch-records/modal-export", query);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="dashboard-modal-actions query-filter-actions" style={{ justifyContent: "flex-start" }}>
        <button className="btn btn-outline-success" onClick={handleDownload} type="button">
          下载XLSX
        </button>
      </div>
      <div className="legacy-table-wrap" ref={tableWrapRef} style={{ maxHeight: "60vh", overflow: "auto" }}>
        <table className="legacy-table">
          <thead>
            <tr>
              <th className="legacy-table-head-cell"><div className="master-static-head">部门</div></th>
              <th className="legacy-table-head-cell"><div className="master-static-head">姓名</div></th>
              <th className="legacy-table-head-cell"><div className="master-static-head">日期</div></th>
              <th className="legacy-table-head-cell"><div className="master-static-head">原始打卡数据</div></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.date}-${index}`}>
                <td className="legacy-table-body-cell">{row.dept_name || ""}</td>
                <td className="legacy-table-body-cell">{row.name || ""}</td>
                <td className="legacy-table-body-cell">{row.date || ""}</td>
                <td className="legacy-table-body-cell">{row.raw_punch_data || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeaveRecordModalTable({
  rows,
  employeeId,
  leaveType,
  month,
}: {
  rows: LeaveRecordRow[];
  employeeId: number | null;
  leaveType: string;
  month: string;
}) {
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  useDragScroll(tableWrapRef);

  function handleDownload() {
    if (!employeeId || !month) {
      return;
    }
    const query = new URLSearchParams();
    query.set("month", month);
    query.set("leave_type", leaveType);
    query.append("emp_ids", String(employeeId));
    window.location.href = buildDownloadUrl("/api/query/leave-records/export", query);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="dashboard-modal-actions query-filter-actions" style={{ justifyContent: "flex-start" }}>
        <button className="btn btn-outline-success" onClick={handleDownload} type="button">
          下载XLSX
        </button>
      </div>
      <div className="legacy-table-wrap" ref={tableWrapRef} style={{ maxHeight: "60vh", overflow: "auto" }}>
        <table className="legacy-table">
          <thead>
            <tr>
              <th className="legacy-table-head-cell"><div className="master-static-head">部门</div></th>
              <th className="legacy-table-head-cell"><div className="master-static-head">姓名</div></th>
              <th className="legacy-table-head-cell"><div className="master-static-head">请假类型</div></th>
              <th className="legacy-table-head-cell"><div className="master-static-head">开始时间</div></th>
              <th className="legacy-table-head-cell"><div className="master-static-head">结束时间</div></th>
              <th className="legacy-table-head-cell"><div className="master-static-head">时长</div></th>
              <th className="legacy-table-head-cell"><div className="master-static-head">事由</div></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.start_time}-${row.end_time}-${index}`}>
                <td className="legacy-table-body-cell">{row.dept_name || ""}</td>
                <td className="legacy-table-body-cell">{row.name || ""}</td>
                <td className="legacy-table-body-cell">{row.leave_type || leaveType}</td>
                <td className="legacy-table-body-cell">{row.start_time || ""}</td>
                <td className="legacy-table-body-cell">{row.end_time || ""}</td>
                <td className="legacy-table-body-cell">{row.duration ?? 0}</td>
                <td className="legacy-table-body-cell">{row.reason || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
