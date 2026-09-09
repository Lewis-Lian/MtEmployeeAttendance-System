import { useEffect, useMemo, useState } from "react";
import { fetchAttendanceCalendar, fetchQueryBootstrap } from "../../api/query";
import AttendanceCalendarGrid from "../../components/attendance/AttendanceCalendarGrid";
import MonthPicker from "../../components/common/MonthPicker";
import LoadingState from "../../components/feedback/LoadingState";
import EmployeePicker from "../../components/query/EmployeePicker";
import type { AttendanceCalendarData, QueryBootstrap } from "../../types/query";
import "./dashboard-shared.css";

const now = new Date();
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

export default function AttendanceCalendarPage() {
  const [bootstrap, setBootstrap] = useState<QueryBootstrap | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [month, setMonth] = useState<string>(currentMonth);
  const [data, setData] = useState<AttendanceCalendarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchQueryBootstrap()
      .then((payload) => {
        setBootstrap(payload);
        // 考勤数据按账套归集，月份默认跟随当前激活账套
        const activeMonth = payload.account_sets.find((item) => item.is_active)?.month;
        if (activeMonth) {
          setMonth(activeMonth);
        }
      })
      .catch(() => setError("基础数据加载失败"));
  }, []);

  const employees = useMemo(() => bootstrap?.employees ?? [], [bootstrap]);
  const departments = useMemo(() => bootstrap?.departments ?? [], [bootstrap]);

  function handleQuery() {
    if (!selectedIds.length) {
      setError("请先选择员工");
      return;
    }
    setLoading(true);
    setError("");
    fetchAttendanceCalendar(selectedIds[0], month)
      .then((result) => { setData(result); })
      .catch(() => setError("日历数据加载失败"))
      .finally(() => setLoading(false));
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
          <p>按月份以日历形式查看员工逐日考勤：刷卡时间、迟到早退、半勤、请假与加班（加班条口径，含晚上加班）。</p>
        </div>

        <div className="query-filter-body">
          <div className="query-filter-field">
            <label className="form-label">员工</label>
            <EmployeePicker
              departments={departments}
              employees={employees}
              filterMode="all"
              onChange={setSelectedIds}
              selectedIds={selectedIds}
              showFieldChrome={false}
              singleSelect
            />
          </div>

          <div className="query-filter-field">
            <label className="form-label">考勤月份</label>
            <MonthPicker onChange={setMonth} value={month} />
          </div>

          <div className="query-filter-actions">
            <button className="btn btn-primary" disabled={loading} onClick={handleQuery} type="button">
              {loading ? "查询中..." : "查询"}
            </button>
          </div>
        </div>

        {error ? <p className="legacy-inline-error">{error}</p> : null}
      </aside>

      <section className="query-workspace">
        {loading ? <LoadingState variant="calendar" /> : null}
        {data ? <AttendanceCalendarGrid data={data} /> : null}
        {!data && !loading ? <div className="text-muted">选择员工和月份后点击查询。</div> : null}
      </section>
    </div>
  );
}
