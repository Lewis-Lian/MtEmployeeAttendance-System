import { useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import { fetchAttendanceCalendar, fetchHomeSummary, fetchQueryBootstrap } from "../../api/query";
import AttendanceCalendarGrid from "../../components/attendance/AttendanceCalendarGrid";
import ErrorState from "../../components/feedback/ErrorState";
import LoadingState from "../../components/feedback/LoadingState";
import KpiNumber from "../../components/query/KpiNumber";
import type { AttendanceCalendarData, QueryBootstrap } from "../../types/query";
import "./QueryHome.css";

function formatMonthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    return month || "当前月份";
  }
  return `${match[1]}年${Number(match[2])}月`;
}

function formatMonthTitle(month: string): string {
  const match = /^\d{4}-(\d{2})$/.exec(month);
  return match ? `${Number(match[1])}月考勤月报` : "考勤月报";
}

function buildMonthlyNarrative(summary: Record<string, number | string> | null): string {
  const attendance = Number(summary?.attendance_days ?? 0);
  const lateEarly = Number(summary?.late_early_minutes ?? 0);

  if (lateEarly > 0) {
    return `本月已记录出勤 ${attendance} 天，累计迟到早退 ${lateEarly} 分钟，请留意异常记录。`;
  }
  if (attendance > 0) {
    return `本月已记录出勤 ${attendance} 天，暂未发现迟到早退记录。`;
  }
  return "本月暂无可展示的考勤记录。";
}

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
    return <div className="query-home-container qh-editorial-shell"><section className="qh-editorial-page"><div className="qh-editorial-page-inner"><header className="qh-editorial-header" aria-hidden="true"><div className="qh-editorial-meta">&nbsp;</div><p className="qh-editorial-eyebrow">MONTHLY ATTENDANCE</p><h2>考勤月报</h2></header><LoadingState message="正在准备查询首页..." variant="home" /></div></section></div>;
  }

  // 假勤数据各百分比计算，用于占比条渲染
  const personalSick = Number(summary?.personal_sick_days ?? 0);
  const injury = Number(summary?.injury_days ?? 0);
  const trip = Number(summary?.business_trip_days ?? 0);
  const marriage = Number(summary?.marriage_days ?? 0);
  const funeral = Number(summary?.funeral_days ?? 0);
  const leaveTotal = personalSick + injury + trip + marriage + funeral;

  const leaveItems = [
    { label: "事病假", value: personalSick },
    { label: "工伤", value: injury },
    { label: "出差", value: trip },
    { label: "婚假", value: marriage },
    { label: "丧假", value: funeral },
  ];

  const monthLabel = formatMonthLabel(month);
  const monthTitle = formatMonthTitle(month);
  const monthlyNarrative = buildMonthlyNarrative(summary);

  return (
    <div className="query-home-container qh-editorial-shell">
      <section aria-label="月报概览" className="qh-editorial-page qh-editorial-page-one">
        <div className="qh-editorial-page-inner">
          <header className="qh-editorial-header">
            <div className="qh-editorial-meta" aria-label="月报身份信息">
              <span>{monthLabel}</span>
              <span>{managerInfo?.dept_name || "暂无部门"}</span>
              <span>{managerInfo?.emp_no || "-"} · {managerInfo?.name || "未绑定管理人员"}</span>
            </div>
            <p className="qh-editorial-eyebrow">MONTHLY ATTENDANCE</p>
            <h2>{monthTitle}</h2>
          </header>

          {isLoading ? <LoadingState message="正在加载首页摘要..." variant="home" /> : null}
          {error && !isLoading ? <ErrorState description={error} title="首页摘要加载失败" /> : null}

          {!isLoading && !error ? (
            <section aria-label="本月整体表现" className="qh-editorial-hero">
            <div className="qh-editorial-lead">
              <p className="qh-editorial-label">本月出勤</p>
              <div className="qh-editorial-attendance">
                <KpiNumber testId="kpi-attendance" value={summary?.attendance_days ?? 0} />
                <small>天</small>
              </div>
              <p className="qh-editorial-narrative" data-testid="monthly-narrative">
                {monthlyNarrative}
              </p>
            </div>

            <div className="qh-editorial-stats">
              <article className="qh-editorial-stat">
                <span>剩余福利</span>
                <strong><KpiNumber testId="kpi-benefit" value={summary?.benefit_days ?? 0} /><small>天</small></strong>
              </article>
              <article className="qh-editorial-stat">
                <span>剩余调休</span>
                <strong><KpiNumber testId="kpi-overtime" value={summary?.overtime_remaining_days ?? 0} /><small>天</small></strong>
              </article>
              <article className="qh-editorial-stat">
                <span>迟到早退</span>
                <strong><KpiNumber testId="kpi-late" value={summary?.late_early_minutes ?? 0} /><small>分钟</small></strong>
              </article>
            </div>
            </section>
          ) : null}
        </div>
      </section>

      {!isLoading && !error ? (
        <>
          {managerEmployeeId && !calendarForbidden ? (
            <section aria-label="考勤日历" className="qh-editorial-page qh-editorial-page-two">
              <div className="qh-editorial-page-inner">
                <section className="qh-editorial-calendar">
              <div className="qh-editorial-section-heading">
                <div>
                  <p>MONTH IN REVIEW</p>
                  <h3>考勤日历</h3>
                </div>
                <span>{monthLabel}</span>
              </div>
              {calendarError ? (
                <p className="qh-editorial-error">{calendarError}</p>
              ) : calendarData ? (
                <AttendanceCalendarGrid data={calendarData} />
              ) : (
                <LoadingState message="正在加载考勤日历..." variant="calendar" />
              )}
                </section>
              </div>
            </section>
          ) : null}

          <section aria-label="月度收束" className="qh-editorial-page qh-editorial-page-three">
            <div className="qh-editorial-page-inner">
              <div className="qh-editorial-closeout-intro">
                <p className="qh-editorial-closeout-kicker">MONTHLY CLOSE</p>
                <div>
                  <p className="qh-editorial-closeout-index">03 / 03</p>
                  <h3>本月考勤<br />汇总</h3>
                </div>
                <p className="qh-editorial-closeout-copy">汇总本月请假、外勤及相关数据状态，全面掌握考勤情况。</p>
              </div>

              <section className="qh-editorial-leave">
                <div className="qh-editorial-leave-heading">
                  <div>
                    <p>LEAVE NOTES</p>
                    <h3>本月请假构成</h3>
                  </div>
                  <div className="qh-editorial-leave-total">
                    <strong data-testid="leave-total">{leaveTotal}</strong>
                    <span>天</span>
                  </div>
                </div>
            <p className="qh-editorial-assistive-title">请假与外勤类型占比</p>
            {leaveTotal > 0 ? (
              <div className="qh-editorial-leave-body">
                <div className="qh-editorial-leave-track" aria-hidden="true">
                  {leaveItems.map((item, index) => item.value > 0 ? (
                    <span
                      className={`tone-${index + 1}`}
                      key={item.label}
                      style={{ width: `${(item.value / leaveTotal) * 100}%` }}
                      title={`${item.label}: ${item.value}天`}
                    />
                  ) : null)}
                </div>
                <div className="qh-editorial-leave-list">
                  {leaveItems.map((item, index) => (
                    <div className="qh-editorial-leave-item" key={item.label}>
                      <span><i className={`tone-${index + 1}`} />{item.label}</span>
                      <strong>{item.value}<small>天</small></strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="qh-editorial-muted">本月无请假记录</p>
            )}
              </section>

              <footer className="qh-editorial-status">
                <span>数据状态</span>
                <p>{message}</p>
              </footer>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
