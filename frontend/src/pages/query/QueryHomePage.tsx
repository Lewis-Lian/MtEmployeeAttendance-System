import { useEffect, useState, type CSSProperties } from "react";
import { ApiError } from "../../api/client";
import { fetchAttendanceCalendar, fetchHomeSummary, fetchQueryBootstrap } from "../../api/query";
import AttendanceCalendarGrid from "../../components/attendance/AttendanceCalendarGrid";
import ErrorState from "../../components/feedback/ErrorState";
import LoadingState from "../../components/feedback/LoadingState";
import KpiNumber from "../../components/query/KpiNumber";
import type { AttendanceCalendarData, QueryBootstrap } from "../../types/query";
import "./QueryHome.css";

export default function QueryHomePage() {
  const [bootstrap, setBootstrap] = useState<QueryBootstrap | null>(null);
  const [month, setMonth] = useState("");
  const [summary, setSummary] = useState<Record<string, number | string> | null>(null);
  const [managerInfo, setManagerInfo] = useState<{ emp_id: number; emp_no: string; name: string; dept_name: string } | null>(null);
  const [message, setMessage] = useState("正在加载首页摘要...");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const [calendarData, setCalendarData] = useState<AttendanceCalendarData | null>(null);
  const [calendarError, setCalendarError] = useState("");
  const [calendarForbidden, setCalendarForbidden] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function bootstrapPage() {
      try {
        const payload = await fetchQueryBootstrap();
        if (!mounted) {
          return;
        }
        const nextMonth = payload.account_sets.find((item) => item.is_active)?.month ?? payload.account_sets[0]?.month ?? "";
        setBootstrap(payload);
        setMonth(nextMonth);
      } catch (caughtError) {
        if (!mounted) {
          return;
        }
        setError(caughtError instanceof ApiError ? caughtError.message : "查询首页初始化失败");
        setIsLoading(false);
      }
    }

    bootstrapPage();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!month) {
      return;
    }

    let mounted = true;

    async function loadSummary() {
      setIsLoading(true);
      try {
        const payload = await fetchHomeSummary(month);
        if (!mounted) {
          return;
        }
        setSummary(payload.summary ?? null);
        setManagerInfo(payload.manager ?? null);
        setMessage(payload.has_data ? payload.support_message ?? "已加载首页摘要" : payload.empty_state || "暂无数据");
        setError("");
      } catch (caughtError) {
        if (!mounted) {
          return;
        }
        setError(caughtError instanceof ApiError ? caughtError.message : "加载首页摘要失败");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadSummary();
    return () => {
      mounted = false;
    };
  }, [month]);

  // 首页日历展示绑定管理人员本人的考勤，员工 id 由 home-summary 的 manager.emp_id 直接提供
  const managerEmployeeId = managerInfo?.emp_id ?? null;

  useEffect(() => {
    if (!managerEmployeeId || !month) {
      return;
    }

    let mounted = true;
    setCalendarData(null);
    setCalendarError("");

    fetchAttendanceCalendar(managerEmployeeId, month)
      .then((payload) => {
        if (mounted) {
          setCalendarData(payload);
        }
      })
      .catch((caughtError) => {
        if (!mounted) {
          return;
        }
        // 无日历接口权限（403）或绑定管理人员超出可见范围（400）时直接隐藏面板
        if (caughtError instanceof ApiError && (caughtError.status === 403 || caughtError.status === 400)) {
          setCalendarForbidden(true);
          return;
        }
        setCalendarError(caughtError instanceof ApiError ? caughtError.message : "考勤日历加载失败");
      });

    return () => {
      mounted = false;
    };
  }, [managerEmployeeId, month]);

  if (error && !bootstrap) {
    return <ErrorState description={error} title="查询首页初始化失败" />;
  }

  if (!bootstrap) {
    return <LoadingState message="正在准备查询首页..." />;
  }

  // 假勤数据各百分比计算，用于占比条渲染
  const personalSick = Number(summary?.personal_sick_days ?? 0);
  const injury = Number(summary?.injury_days ?? 0);
  const trip = Number(summary?.business_trip_days ?? 0);
  const marriage = Number(summary?.marriage_days ?? 0);
  const funeral = Number(summary?.funeral_days ?? 0);
  const leaveTotal = personalSick + injury + trip + marriage + funeral;

  const kpis = [
    { key: "attendance", label: "考勤天数", value: summary?.attendance_days ?? 0, unit: "天", testId: "kpi-attendance" },
    { key: "benefit", label: "剩余福利", value: summary?.benefit_days ?? 0, unit: "天", testId: "kpi-benefit" },
    { key: "overtime", label: "剩余调休", value: summary?.overtime_remaining_days ?? 0, unit: "天", testId: "kpi-overtime" },
    { key: "late", label: "迟到早退", value: summary?.late_early_minutes ?? 0, unit: "分钟", testId: "kpi-late" },
  ];

  const leaveItems = [
    { label: "事病假", value: personalSick, className: "sick" },
    { label: "工伤", value: injury, className: "injury" },
    { label: "出差", value: trip, className: "trip" },
    { label: "婚假", value: marriage, className: "marriage" },
    { label: "丧假", value: funeral, className: "funeral" },
  ];

  return (
    <div className="query-home-container qh-minimal-shell">
      <header className="qh-minimal-header">
        <div>
          <p className="qh-minimal-eyebrow">MT EMPHUB / ATTENDANCE</p>
          <h2>今日概览</h2>
          <p className="qh-minimal-subtitle">{managerInfo?.emp_no || "-"} · {managerInfo?.name || "未绑定管理人员"} · {managerInfo?.dept_name || "暂无部门"}</p>
        </div>
      </header>

      {isLoading ? <LoadingState message="正在加载首页摘要..." /> : null}
      {error && !isLoading ? <ErrorState description={error} title="首页摘要加载失败" /> : null}

      {!isLoading && !error ? (
        <>
          <section className="qh-minimal-kpis" aria-label="关键指标">
            {kpis.map((kpi, index) => (
              <div className={`qh-kpi-card-hero qh-minimal-kpi ${kpi.key}`} key={kpi.key} style={{ "--qh-kpi-index": index } as CSSProperties}>
                <span className="qh-minimal-kpi-label">{kpi.label}</span>
                <div className="qh-minimal-kpi-value"><KpiNumber testId={kpi.testId} value={kpi.value} /><small>{kpi.unit}</small></div>
                <span className="qh-minimal-kpi-rule" />
              </div>
            ))}
          </section>

          <div className="qh-minimal-grid">
            {managerEmployeeId && !calendarForbidden ? (
              <section className="qh-minimal-panel qh-minimal-calendar-panel">
                <div className="qh-minimal-panel-heading"><div><p className="qh-minimal-panel-kicker">PERSONAL RECORD</p><h3>考勤日历</h3></div><span>{month || "-"}</span></div>
                {calendarError ? <p className="qh-minimal-error">{calendarError}</p> : calendarData ? <AttendanceCalendarGrid data={calendarData} /> : <p className="qh-minimal-muted">正在加载考勤日历...</p>}
              </section>
            ) : null}

            <div className="qh-minimal-side">
              <section className="qh-minimal-panel">
                <div className="qh-minimal-panel-heading"><div><p className="qh-minimal-panel-kicker">MONTHLY BREAKDOWN</p><h3>本月请假构成</h3></div><span>共 {leaveTotal} 天</span></div>
                <p className="qh-minimal-assistive-title">请假与外勤类型占比</p>
                {leaveTotal > 0 ? (
                  <div className="qh-minimal-breakdown">
                    <div className="qh-minimal-stack-bar">{leaveItems.map((item) => item.value > 0 ? <span className={item.className} key={item.label} style={{ width: `${(item.value / leaveTotal) * 100}%` }} title={`${item.label}: ${item.value}天`} /> : null)}</div>
                    {leaveItems.map((item) => <div className="qh-minimal-breakdown-row" key={item.label}><span><i className={item.className} />{item.label}</span><strong>{item.value} 天</strong></div>)}
                  </div>
                ) : <p className="qh-minimal-muted">本月暂无请假或出差记录</p>}
              </section>

              <section className="qh-minimal-note"><span className="qh-minimal-note-mark">i</span><div><strong>数据状态</strong><p>{message}</p></div></section>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
