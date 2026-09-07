import { useEffect, useState, type CSSProperties } from "react";
import { ApiError } from "../../api/client";
import { fetchAttendanceCalendar, fetchHomeSummary, fetchQueryBootstrap } from "../../api/query";
import { fetchMe } from "../../api/auth";
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
  const [managerLabel, setManagerLabel] = useState("");
  const [managerInfo, setManagerInfo] = useState<{ emp_id: number; emp_no: string; name: string; dept_name: string } | null>(null);
  const [message, setMessage] = useState("正在加载首页摘要...");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const [isAdmin, setIsAdmin] = useState(false);

  const [calendarData, setCalendarData] = useState<AttendanceCalendarData | null>(null);
  const [calendarError, setCalendarError] = useState("");
  const [calendarForbidden, setCalendarForbidden] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function bootstrapPage() {
      try {
        const [payload, me] = await Promise.all([fetchQueryBootstrap(), fetchMe()]);
        if (!mounted) {
          return;
        }
        setIsAdmin(me.role === "admin");
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
        setManagerLabel(
          payload.manager ? `${payload.manager.emp_no} · ${payload.manager.name} · ${payload.manager.dept_name}` : "",
        );
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

  const activeAccountSet = bootstrap.account_sets.find((accountSet) => accountSet.month === month) ?? null;

  // 假勤数据各百分比计算，用于占比条渲染
  const personalSick = Number(summary?.personal_sick_days ?? 0);
  const injury = Number(summary?.injury_days ?? 0);
  const trip = Number(summary?.business_trip_days ?? 0);
  const marriage = Number(summary?.marriage_days ?? 0);
  const funeral = Number(summary?.funeral_days ?? 0);
  const leaveTotal = personalSick + injury + trip + marriage + funeral;

  const sickPercent = leaveTotal > 0 ? (personalSick / leaveTotal) * 100 : 0;
  const injuryPercent = leaveTotal > 0 ? (injury / leaveTotal) * 100 : 0;
  const tripPercent = leaveTotal > 0 ? (trip / leaveTotal) * 100 : 0;
  const marriagePercent = leaveTotal > 0 ? (marriage / leaveTotal) * 100 : 0;
  const funeralPercent = leaveTotal > 0 ? (funeral / leaveTotal) * 100 : 0;

  return (
    <div className="query-home-container">
      {/* 极光背景流动球 */}
      <div className="query-home-decoration-layer" aria-hidden="true">
        <div className="qh-glow-sphere sphere-1" />
        <div className="qh-glow-sphere sphere-2" />
        <div className="qh-glow-sphere sphere-3" />
      </div>

      {/* 仪表盘头部信息区 */}
      <header className="qh-dashboard-header">
        <div className="qh-header-title-area">
          <p className="qh-header-kicker">Dashboard</p>
          <h2 className="qh-header-title">管理人员首页概览</h2>
        </div>
        <div className="qh-header-flat-controls">
          {/* 精致个人信息卡 */}
          <div className="qh-flat-profile">
            <div className="qh-avatar-badge">
              {managerInfo?.name ? managerInfo.name.charAt(0) : "管"}
            </div>
            <div className="qh-flat-meta">
              <h3 className="qh-flat-name">
                {managerInfo?.name || "未绑定管理人员"}
                {isAdmin && <span className="qh-admin-badge">高级管理员</span>}
              </h3>
              <div className="qh-flat-sub">
                <span>工号: {managerInfo?.emp_no || "-"}</span>
                <span>所属部门: {managerInfo?.dept_name || "-"}</span>
              </div>
            </div>
            <span style={{ display: "none" }}>{managerLabel}</span>
          </div>

          {/* 账套月份选择器 */}
          <div className="qh-flat-select-wrapper">
            <span className="qh-flat-select-label">账套月份</span>
            <select className="qh-flat-select-input" onChange={(event) => setMonth(event.target.value)} value={month}>
              {bootstrap.account_sets.map((accountSet) => (
                <option key={accountSet.id} value={accountSet.month}>
                  {accountSet.name}
                  {accountSet.is_active ? "（当前）" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* 数据就绪状态标签 */}
          <div className="qh-flat-status-badge">
            <span className={`qh-status-dot ${!isLoading && !error ? "active" : ""}`} />
            <span>
              {activeAccountSet?.name ?? "未选择"} · {isLoading ? "正在加载" : error ? "加载失败" : "已就绪"}
            </span>
          </div>
        </div>
      </header>

      {isLoading ? <LoadingState message="正在加载首页摘要..." /> : null}
      {error && !isLoading ? <ErrorState description={error} title="首页摘要加载失败" /> : null}

      {!isLoading && !error ? (
        <>
          {/* 四列大卡片核心 KPI 网格 */}
          <section className="qh-main-kpis-four">
            <div className="qh-kpi-card-hero attendance" style={{ "--qh-kpi-index": 0 } as CSSProperties}>
              <div className="qh-kpi-hero-label">
                <span>考勤天数</span>
                <span className="qh-kpi-icon-wrapper">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </span>
              </div>
              <div className="qh-kpi-hero-body">
                <strong className="qh-kpi-hero-value"><KpiNumber testId="kpi-attendance" value={summary?.attendance_days ?? 0} /></strong>
                <span className="qh-kpi-hero-unit">天</span>
              </div>
            </div>
            
            <div className="qh-kpi-card-hero benefit" style={{ "--qh-kpi-index": 1 } as CSSProperties}>
              <div className="qh-kpi-hero-label">
                <span>剩余福利天数</span>
                <span className="qh-kpi-icon-wrapper">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                    <path d="M2 17l10 5 10-5"></path>
                    <path d="M2 12l10 5 10-5"></path>
                  </svg>
                </span>
              </div>
              <div className="qh-kpi-hero-body">
                <strong className="qh-kpi-hero-value"><KpiNumber testId="kpi-benefit" value={summary?.benefit_days ?? 0} /></strong>
                <span className="qh-kpi-hero-unit">天</span>
              </div>
            </div>

            <div className="qh-kpi-card-hero overtime" style={{ "--qh-kpi-index": 2 } as CSSProperties}>
              <div className="qh-kpi-hero-label">
                <span>剩余调休天数</span>
                <span className="qh-kpi-icon-wrapper">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                </span>
              </div>
              <div className="qh-kpi-hero-body">
                <strong className="qh-kpi-hero-value"><KpiNumber testId="kpi-overtime" value={summary?.overtime_remaining_days ?? 0} /></strong>
                <span className="qh-kpi-hero-unit">天</span>
              </div>
            </div>

            <div className="qh-kpi-card-hero late-minutes" style={{ "--qh-kpi-index": 3 } as CSSProperties}>
              <div className="qh-kpi-hero-label">
                <span>迟到早退分钟数</span>
                <span className="qh-kpi-icon-wrapper">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                </span>
              </div>
              <div className="qh-kpi-hero-body">
                <strong className="qh-kpi-hero-value"><KpiNumber testId="kpi-late" value={summary?.late_early_minutes ?? 0} /></strong>
                <span className="qh-kpi-hero-unit">分钟</span>
              </div>
            </div>
          </section>

          {/* 自适应双栏 */}
          <div className="qh-layout-columns">
            {/* 左栏：详细指标面板按性质分类磨砂玻璃卡片 */}
            <section className="qh-dashboard-panel">
              <h3 className="qh-panel-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--qh-primary)" }}>
                  <line x1="18" y1="20" x2="18" y2="10"></line>
                  <line x1="12" y1="20" x2="12" y2="4"></line>
                  <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
                <span>详细考勤指标分析</span>
              </h3>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "28px", marginTop: "24px" }}>
                {/* 类别1: 出勤指标 */}
                <div>
                  <h4 className="qh-indicator-section-title">
                    <span className="qh-neon-dot green" />
                    <span>工作与出勤</span>
                  </h4>
                  <div className="qh-indicator-grid">
                    <div className="qh-indicator-item-card green-rail">
                      <div className="qh-indicator-label">考勤天数</div>
                      <div className="qh-indicator-value">{summary?.attendance_days ?? 0} <span className="qh-kpi-hero-unit">天</span></div>
                    </div>
                    <div className="qh-indicator-item-card green-rail">
                      <div className="qh-indicator-label">外勤出差天数</div>
                      <div className="qh-indicator-value">{summary?.business_trip_days ?? 0} <span className="qh-kpi-hero-unit">天</span></div>
                    </div>
                  </div>
                </div>

                {/* 类别2: 请假缺勤 */}
                <div>
                  <h4 className="qh-indicator-section-title">
                    <span className="qh-neon-dot orange" />
                    <span>缺勤与假勤</span>
                  </h4>
                  <div className="qh-indicator-grid">
                    <div className="qh-indicator-item-card orange-rail">
                      <div className="qh-indicator-label">事病假天数</div>
                      <div className="qh-indicator-value" style={{ color: "var(--qh-warning)" }}>{summary?.personal_sick_days ?? 0} <span className="qh-kpi-hero-unit">天</span></div>
                    </div>
                    <div className="qh-indicator-item-card orange-rail">
                      <div className="qh-indicator-label">工伤天数</div>
                      <div className="qh-indicator-value" style={{ color: "var(--qh-warning)" }}>{summary?.injury_days ?? 0} <span className="qh-kpi-hero-unit">天</span></div>
                    </div>
                    <div className="qh-indicator-item-card orange-rail">
                      <div className="qh-indicator-label">婚假天数</div>
                      <div className="qh-indicator-value" style={{ color: "var(--qh-warning)" }}>{summary?.marriage_days ?? 0} <span className="qh-kpi-hero-unit">天</span></div>
                    </div>
                    <div className="qh-indicator-item-card orange-rail">
                      <div className="qh-indicator-label">丧假天数</div>
                      <div className="qh-indicator-value" style={{ color: "var(--qh-warning)" }}>{summary?.funeral_days ?? 0} <span className="qh-kpi-hero-unit">天</span></div>
                    </div>
                  </div>
                </div>

                {/* 类别3: 额度余额 */}
                <div>
                  <h4 className="qh-indicator-section-title">
                    <span className="qh-neon-dot purple" />
                    <span>额度与假勤余额</span>
                  </h4>
                  <div className="qh-indicator-grid">
                    <div className="qh-indicator-item-card purple-rail">
                      <div className="qh-indicator-label">剩余福利天数</div>
                      <div className="qh-indicator-value" style={{ color: "var(--qh-purple)" }}>{summary?.benefit_days ?? 0} <span className="qh-kpi-hero-unit">天</span></div>
                    </div>
                    <div className="qh-indicator-item-card purple-rail">
                      <div className="qh-indicator-label">剩余调休天数</div>
                      <div className="qh-indicator-value" style={{ color: "var(--qh-purple)" }}>{summary?.overtime_remaining_days ?? 0} <span className="qh-kpi-hero-unit">天</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 右栏：考勤日历、占比堆叠条和系统广播 Notice Banner */}
            <div className="qh-right-box">
              {/* 考勤日历面板：位于“请假与外勤类型占比”上方，展示绑定管理人员本人当月考勤 */}
              {managerEmployeeId && !calendarForbidden ? (
                <section className="qh-dashboard-panel">
                  <h3 className="qh-panel-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--qh-primary)" }}>
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <span>考勤日历</span>
                  </h3>

                  {calendarError ? (
                    <p className="legacy-inline-error" style={{ marginTop: "24px" }}>{calendarError}</p>
                  ) : calendarData ? (
                    <div style={{ marginTop: "24px" }}>
                      <AttendanceCalendarGrid data={calendarData} />
                    </div>
                  ) : (
                    <p className="text-muted" style={{ marginTop: "24px" }}>正在加载考勤日历...</p>
                  )}
                </section>
              ) : null}

              {/* 请假假勤占比分析 */}
              <section className="qh-dashboard-panel">
                <h3 className="qh-panel-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--qh-purple)" }}>
                    <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
                    <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
                  </svg>
                  <span>请假与外勤类型占比</span>
                </h3>
                
                <div className="qh-stack-bar-box" style={{ marginTop: "24px" }}>
                  {leaveTotal > 0 ? (
                    <>
                      <div className="qh-stack-bar-wrapper">
                        {personalSick > 0 && <div className="qh-stack-segment sick" style={{ width: `${sickPercent}%` }} title={`事病假: ${personalSick}天`} />}
                        {injury > 0 && <div className="qh-stack-segment injury" style={{ width: `${injuryPercent}%` }} title={`工伤: ${injury}天`} />}
                        {trip > 0 && <div className="qh-stack-segment trip" style={{ width: `${tripPercent}%` }} title={`出差: ${trip}天`} />}
                        {marriage > 0 && <div className="qh-stack-segment marriage" style={{ width: `${marriagePercent}%` }} title={`婚假: ${marriage}天`} />}
                        {funeral > 0 && <div className="qh-stack-segment funeral" style={{ width: `${funeralPercent}%` }} title={`丧假: ${funeral}天`} />}
                      </div>
                      
                      <div className="qh-stack-legend" style={{ marginTop: "8px" }}>
                        {personalSick > 0 && (
                          <div className="qh-legend-item">
                            <span className="qh-legend-dot sick" />
                            <span>事病假 ({personalSick}天)</span>
                          </div>
                        )}
                        {injury > 0 && (
                          <div className="qh-legend-item">
                            <span className="qh-legend-dot injury" />
                            <span>工伤 ({injury}天)</span>
                          </div>
                        )}
                        {trip > 0 && (
                          <div className="qh-legend-item">
                            <span className="qh-legend-dot trip" />
                            <span>出差 ({trip}天)</span>
                          </div>
                        )}
                        {marriage > 0 && (
                          <div className="qh-legend-item">
                            <span className="qh-legend-dot marriage" />
                            <span>婚假 ({marriage}天)</span>
                          </div>
                        )}
                        {funeral > 0 && (
                          <div className="qh-legend-item">
                            <span className="qh-legend-dot funeral" />
                            <span>丧假 ({funeral}天)</span>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="qh-stack-empty" style={{ padding: "24px 0" }}>本月暂无请假或出差记录</div>
                  )}
                </div>
              </section>

              {/* 首页说明 Notice Banner */}
              <div className="qh-notice-banner">
                <div className="qh-notice-content">
                  <h4 className="qh-notice-title">首页说明</h4>
                  <p className="qh-notice-body">{message}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
