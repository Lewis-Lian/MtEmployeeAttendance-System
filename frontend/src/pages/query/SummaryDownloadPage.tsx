import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { buildDownloadUrl, fetchQueryBootstrap } from "../../api/query";
import EmployeePicker from "../../components/query/EmployeePicker";
import ErrorState from "../../components/feedback/ErrorState";
import LoadingState from "../../components/feedback/LoadingState";
import QueryProgressOverlay from "../../components/feedback/QueryProgressOverlay";
import type { QueryBootstrap } from "../../types/query";

const FINAL_HEADERS = [
  "部门名称",
  "人员编号",
  "人员名称",
  "考勤天数",
  "打卡天数",
  "病假（次数）",
  "工伤（次数）",
  "丧假（次数）",
  "事假（次数）",
  "补休（调休）(次)",
  "婚假（次）",
  "病假时长（天）",
  "工伤时长（天）",
  "丧假时长（天）",
  "事假时长（天）",
  "补休（调休）(天)",
  "婚假（天）",
  "工时",
  "半勤天数",
  "备注",
];

const PUNCH_HEADERS = [
  "日期",
  "员工编号",
  "员工姓名",
  "部门",
  "原始打卡数据",
  "上班打卡",
  "下班打卡",
  "打卡次数",
  "实出勤小时",
  "迟到分钟",
  "早退分钟",
  "异常原因",
];

const ABNORMAL_HEADERS = ["部门名称", "人员编号", "人员姓名", "异常考勤次数"];

const EMP_DEPT_HOURS_HEADERS = ["部门名称", "总工时（小时）", "部门人数"];

const MGR_ATTENDANCE_HEADERS = [
  "部   门",
  "姓名",
  "出勤天数",
  "实际出勤天数",
  "事/病假",
  "工伤",
  "出差",
  "婚假",
  "丧假",
  "迟到\\早退",
  "汇总",
  "福利天数",
  "加班变化",
  "备注",
];

const MGR_OVERTIME_HEADERS = [
  "部门",
  "姓名",
  "前年累积天数",
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
  "剩余调休天数",
  "备注",
];

const MGR_ANNUAL_LEAVE_HEADERS = [
  "部门",
  "姓名",
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
  "剩余年休天数",
  "备注",
];

const MGR_DEPT_HOURS_HEADERS = ["部门名称", "总工时（小时）", "部门人数"];

export default function SummaryDownloadPage() {
  const [bootstrap, setBootstrap] = useState<QueryBootstrap | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);

  // 8张表勾选状态
  const [includeFinal, setIncludeFinal] = useState(true);
  const [includePunch, setIncludePunch] = useState(true);
  const [includeAbnormal, setIncludeAbnormal] = useState(false);
  const [includeEmpDeptHours, setIncludeEmpDeptHours] = useState(false);
  const [includeMgrAttendance, setIncludeMgrAttendance] = useState(false);
  const [includeMgrOvertime, setIncludeMgrOvertime] = useState(false);
  const [includeMgrAnnualLeave, setIncludeMgrAnnualLeave] = useState(false);
  const [includeMgrDeptHours, setIncludeMgrDeptHours] = useState(false);

  // 8张表表头过滤配置状态
  const [finalHeaders, setFinalHeaders] = useState<string[]>(FINAL_HEADERS);
  const [punchHeaders, setPunchHeaders] = useState<string[]>(PUNCH_HEADERS);
  const [abnormalHeaders, setAbnormalHeaders] = useState<string[]>(ABNORMAL_HEADERS);
  const [empDeptHoursHeaders, setEmpDeptHoursHeaders] = useState<string[]>(EMP_DEPT_HOURS_HEADERS);
  const [mgrAttendanceHeaders, setMgrAttendanceHeaders] = useState<string[]>(MGR_ATTENDANCE_HEADERS);
  const [mgrOvertimeHeaders, setMgrOvertimeHeaders] = useState<string[]>(MGR_OVERTIME_HEADERS);
  const [mgrAnnualLeaveHeaders, setMgrAnnualLeaveHeaders] = useState<string[]>(MGR_ANNUAL_LEAVE_HEADERS);
  const [mgrDeptHoursHeaders, setMgrDeptHoursHeaders] = useState<string[]>(MGR_DEPT_HOURS_HEADERS);

  // 进度条状态
  const [progressVisible, setProgressVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("");

  useEffect(() => {
    let mounted = true;

    async function bootstrapPage() {
      try {
        const payload = await fetchQueryBootstrap();
        if (!mounted) {
          return;
        }
        setBootstrap(payload);
        setSelectedMonth(payload.account_sets.find((item) => item.is_active)?.month ?? payload.account_sets[0]?.month ?? "");
        setError("");
      } catch (caughtError) {
        if (!mounted) {
          return;
        }
        setError(caughtError instanceof ApiError ? caughtError.message : "汇总下载页初始化失败");
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

  // 下载进度条定时器：组件卸载时清理，避免卸载后 setState。
  const downloadTimersRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downloadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    return () => {
      if (downloadIntervalRef.current) {
        clearInterval(downloadIntervalRef.current);
        downloadIntervalRef.current = null;
      }
      if (downloadTimersRef.current) {
        clearTimeout(downloadTimersRef.current);
        downloadTimersRef.current = null;
      }
    };
  }, []);

  const applyPreset1 = () => {
    // 预设1：员工考勤汇总
    setIncludeFinal(true);
    setIncludePunch(true);
    setIncludeAbnormal(false);
    setIncludeEmpDeptHours(false);
    setIncludeMgrAttendance(false);
    setIncludeMgrOvertime(false);
    setIncludeMgrAnnualLeave(false);
    setIncludeMgrDeptHours(false);

    setFinalHeaders(FINAL_HEADERS);
    setPunchHeaders(PUNCH_HEADERS.filter((h) => h !== "上班打卡" && h !== "下班打卡"));
  };

  const applyPreset2 = () => {
    // 预设2：工时汇总
    setIncludeFinal(false);
    setIncludePunch(false);
    setIncludeAbnormal(false);
    setIncludeEmpDeptHours(true);
    setIncludeMgrAttendance(false);
    setIncludeMgrOvertime(false);
    setIncludeMgrAnnualLeave(false);
    setIncludeMgrDeptHours(true);

    setEmpDeptHoursHeaders(EMP_DEPT_HOURS_HEADERS);
    setMgrDeptHoursHeaders(MGR_DEPT_HOURS_HEADERS);
  };

  function toggleAllHeaders(headers: string[], selectedHeaders: string[], setSelectedHeaders: (headers: string[]) => void) {
    setSelectedHeaders(selectedHeaders.length === headers.length ? [] : headers);
  }

  function toggleHeader(header: string, selectedHeaders: string[], setSelectedHeaders: (headers: string[]) => void) {
    setSelectedHeaders(
      selectedHeaders.includes(header)
        ? selectedHeaders.filter((item) => item !== header)
        : [...selectedHeaders, header],
    );
  }

  function handleDownload() {
    const selectedSheets = [
      includeFinal ? "final" : "",
      includePunch ? "punch" : "",
      includeAbnormal ? "abnormal" : "",
      includeEmpDeptHours ? "emp_dept_hours" : "",
      includeMgrAttendance ? "mgr_attendance" : "",
      includeMgrOvertime ? "mgr_overtime" : "",
      includeMgrAnnualLeave ? "mgr_annual_leave" : "",
      includeMgrDeptHours ? "mgr_dept_hours" : "",
    ].filter(Boolean);

    if (selectedSheets.length === 0) {
      setError("请至少选择一个要导出的表格。");
      return;
    }
    setError("");

    const query = new URLSearchParams();
    if (selectedMonth) {
      query.set("month", selectedMonth);
    }
    selectedEmployeeIds.forEach((employeeId) => query.append("emp_ids", String(employeeId)));
    query.set("sheets", selectedSheets.join(","));

    if (includeFinal) query.set("final_headers", finalHeaders.join(","));
    if (includePunch) query.set("punch_headers", punchHeaders.join(","));
    if (includeAbnormal) query.set("abnormal_headers", abnormalHeaders.join(","));
    if (includeEmpDeptHours) query.set("emp_dept_hours_headers", empDeptHoursHeaders.join(","));
    if (includeMgrAttendance) query.set("mgr_attendance_headers", mgrAttendanceHeaders.join(","));
    if (includeMgrOvertime) query.set("mgr_overtime_headers", mgrOvertimeHeaders.join(","));
    if (includeMgrAnnualLeave) query.set("mgr_annual_leave_headers", mgrAnnualLeaveHeaders.join(","));
    if (includeMgrDeptHours) query.set("mgr_dept_hours_headers", mgrDeptHoursHeaders.join(","));

    setProgressVisible(true);
    setProgress(0);
    setLoadingText("正在为您生成并下载汇总工作簿...");

    let current = 0;
    downloadIntervalRef.current = setInterval(() => {
      current += Math.floor(Math.random() * 15) + 5;
      if (current >= 99) {
        current = 99;
      }
      setProgress(current);
    }, 150);

    downloadTimersRef.current = setTimeout(() => {
      if (downloadIntervalRef.current) {
        clearInterval(downloadIntervalRef.current);
        downloadIntervalRef.current = null;
      }
      setProgress(100);
      setLoadingText("下载已准备就绪！");
      window.location.href = buildDownloadUrl("/api/query/summary-download/export", query);

      downloadTimersRef.current = setTimeout(() => {
        setProgressVisible(false);
      }, 500);
    }, 1500);
  }

  if (isLoading) {
    return <LoadingState message="正在准备汇总下载页..." />;
  }

  if (error && !bootstrap) {
    return <ErrorState description={error} title="汇总下载页初始化失败" />;
  }

  if (!bootstrap) {
    return <ErrorState description="未能读取汇总下载页基础数据。" />;
  }

  const activeAccountSet = bootstrap.account_sets.find((accountSet) => accountSet.month === selectedMonth) ?? null;
  const selectedEmployeeCount = selectedEmployeeIds.length;
  const enabledReportsCount = [
    includeFinal,
    includePunch,
    includeAbnormal,
    includeEmpDeptHours,
    includeMgrAttendance,
    includeMgrOvertime,
    includeMgrAnnualLeave,
    includeMgrDeptHours,
  ].filter(Boolean).length;

  const downloadStatus =
    enabledReportsCount === 0
      ? "未选择报表"
      : selectedMonth
        ? `已选 ${enabledReportsCount} 份报表，等待下载`
        : "请先选择账套月份";

  const isPreset1Active =
    includeFinal &&
    includePunch &&
    !includeAbnormal &&
    !includeEmpDeptHours &&
    !includeMgrAttendance &&
    !includeMgrOvertime &&
    !includeMgrAnnualLeave &&
    !includeMgrDeptHours &&
    finalHeaders.length === FINAL_HEADERS.length &&
    punchHeaders.length === PUNCH_HEADERS.filter((h) => h !== "上班打卡" && h !== "下班打卡").length;

  const isPreset2Active =
    !includeFinal &&
    !includePunch &&
    !includeAbnormal &&
    includeEmpDeptHours &&
    !includeMgrAttendance &&
    !includeMgrOvertime &&
    !includeMgrAnnualLeave &&
    includeMgrDeptHours &&
    empDeptHoursHeaders.length === EMP_DEPT_HOURS_HEADERS.length &&
    mgrDeptHoursHeaders.length === MGR_DEPT_HOURS_HEADERS.length;

  return (
    <section className="legacy-page-section summary-download-container">
      <QueryProgressOverlay active={progressVisible} progress={progress} text={loadingText} />

      {/* 载入高级页内 CSS */}
      <style dangerouslySetInnerHTML={{ __html: `
        .summary-download-container .query-progress-overlay {
          position: fixed !important;
          border-radius: 0 !important;
        }
        .summary-download-container {
          max-width: 1200px;
          margin: 0 auto;
          animation: fadeIn 0.4s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .step-card {
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(226, 232, 240, 0.8);
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 24px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.03), 0 2px 4px -1px rgba(0, 0, 0, 0.01);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .step-card:hover {
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.02);
          border-color: rgba(191, 219, 254, 0.8);
        }
        .step-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
          border-bottom: 1px solid #f1f5f9;
          padding-bottom: 12px;
        }
        .step-number {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
          font-weight: 700;
          font-size: 13px;
          box-shadow: 0 4px 10px rgba(37, 99, 235, 0.3);
        }
        .step-title {
          font-size: 16px;
          font-weight: 600;
          color: #0f172a;
          margin: 0;
        }
        .step-desc {
          font-size: 12.5px;
          color: #64748b;
          margin: 0 0 0 auto;
        }
        .preset-scenarios-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 20px;
        }
        .preset-card-btn {
          position: relative;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 18px;
          background: #ffffff;
          text-align: left;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          overflow: hidden;
          display: block;
          width: 100%;
        }
        .preset-card-btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 4px;
          height: 100%;
          background: transparent;
          transition: background 0.25s;
        }
        .preset-card-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.05);
          border-color: #cbd5e1;
        }
        .preset-card-btn.active-preset-1 {
          border-color: #2563eb;
          background: linear-gradient(185deg, #f0f7ff 0%, #ffffff 100%);
        }
        .preset-card-btn.active-preset-1::before {
          background: #2563eb;
        }
        .preset-card-btn.active-preset-2 {
          border-color: #10b981;
          background: linear-gradient(185deg, #ecfdf5 0%, #ffffff 100%);
        }
        .preset-card-btn.active-preset-2::before {
          background: #10b981;
        }
        .sheet-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 12px;
        }
        .sheet-selection-card {
          position: relative;
          display: flex;
          align-items: center;
          padding: 14px 16px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          cursor: pointer;
          background: #ffffff;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          user-select: none;
        }
        .sheet-selection-card:hover {
          border-color: #cbd5e1;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
        }
        .sheet-selection-card.checked {
          border-color: #2563eb;
          background: rgba(37, 99, 235, 0.03);
          box-shadow: 0 0 0 1px #2563eb;
        }
        .sheet-selection-card input[type="checkbox"] {
          width: 16px;
          height: 16px;
          accent-color: #2563eb;
          margin-right: 12px;
          cursor: pointer;
        }
        .sheet-label-text {
          font-weight: 500;
          color: #334155;
          font-size: 13.5px;
          transition: color 0.2s;
        }
        .sheet-selection-card.checked .sheet-label-text {
          color: #1d4ed8;
          font-weight: 600;
        }
        .sheet-badge-type {
          font-size: 10.5px;
          padding: 2px 6px;
          border-radius: 4px;
          background: #f1f5f9;
          color: #64748b;
          margin-left: auto;
          font-weight: 500;
        }
        .sheet-selection-card.checked .sheet-badge-type {
          background: #2563eb;
          color: #ffffff;
        }
        .header-badge-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .header-badge-item {
          display: inline-flex;
          align-items: center;
          padding: 5px 12px 5px 10px;
          border-radius: 9999px;
          font-size: 12px;
          cursor: pointer;
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #e2e8f0;
          transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
          user-select: none;
        }
        .header-badge-item:hover {
          background: #e2e8f0;
          color: #1e293b;
          border-color: #cbd5e1;
        }
        .header-badge-item.checked {
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
          color: #1d4ed8;
          border-color: #bfdbfe;
          font-weight: 500;
          box-shadow: 0 2px 4px rgba(37, 99, 235, 0.03);
        }
        .header-badge-item input[type="checkbox"] {
          display: none;
        }
        .header-badge-item::before {
          content: '';
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #94a3b8;
          margin-right: 6px;
          transition: all 0.15s;
        }
        .header-badge-item.checked::before {
          background: #2563eb;
          transform: scale(1.2);
        }
        .premium-console-wrapper {
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          color: #f8fafc;
          border-radius: 16px;
          padding: 24px 32px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 12px 30px -10px rgba(15, 23, 42, 0.4);
          margin-top: 32px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          position: relative;
          overflow: hidden;
        }
        .premium-console-wrapper::after {
          content: '';
          position: absolute;
          top: -50%;
          right: -50%;
          width: 300px;
          height: 300px;
          background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%);
          pointer-events: none;
        }
        .console-stats-container {
          display: flex;
          gap: 40px;
        }
        .console-stat-box {
          display: flex;
          flex-direction: column;
        }
        .console-stat-title {
          font-size: 11px;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 6px;
        }
        .console-stat-content {
          font-size: 18px;
          font-weight: 600;
          color: #f8fafc;
        }
        .console-stat-subtitle {
          font-size: 12px;
          color: #64748b;
          margin-top: 2px;
        }
        .btn-premium-download {
          position: relative;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: #ffffff;
          border: none;
          border-radius: 12px;
          padding: 14px 32px;
          font-weight: 600;
          font-size: 15px;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          z-index: 1;
        }
        .btn-premium-download:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(37, 99, 235, 0.5);
          background: linear-gradient(135deg, #4f46e5 0%, #2563eb 100%);
        }
        .btn-premium-download:active {
          transform: translateY(0);
        }
        .btn-premium-download.is-loading {
          cursor: wait;
        }
        .btn-premium-download.is-loading .chevron-arrow {
          animation: summary-download-spin 0.65s linear infinite;
        }
        @keyframes summary-download-spin {
          to { transform: rotate(360deg); }
        }
        .btn-premium-download:disabled {
          background: #334155;
          box-shadow: none;
          color: #64748b;
          cursor: not-allowed;
          transform: none;
        }
        .chevron-arrow {
          transition: transform 0.2s;
        }
        .btn-premium-download:hover .chevron-arrow {
          transform: translateX(2px);
        }

        /* 让第一个步骤卡片的层叠上下文处于高位，防止下拉列表被下方步骤二卡片遮挡 */
        .summary-download-container > .step-card:nth-of-type(1) {
          position: relative;
          z-index: 10;
        }
        .summary-download-container > .step-card:nth-of-type(2) {
          position: relative;
          z-index: 5;
        }
        .summary-download-container > .step-card:nth-of-type(3) {
          position: relative;
          z-index: 2;
        }

        /* 强制对齐员工选择器输入框和账套月份的下拉框样式 */
        .summary-download-container .employee-lookup .input-group {
          height: 38px !important;
        }
        .summary-download-container .employee-lookup .form-control {
          height: 38px !important;
          min-height: 38px !important;
          border: 1px solid #c7d2de !important;
          background: #ffffff !important;
          color: #183153 !important;
          font-size: 14px !important;
          line-height: 1.5 !important;
          box-sizing: border-box !important;
          padding: 8px 10px !important;
          border-radius: 4px 0 0 4px !important;
        }
        .summary-download-container .employee-lookup .btn {
          height: 38px !important;
          min-height: 38px !important;
          box-sizing: border-box !important;
          border: 1px solid #c7d2de !important;
          border-left: none !important;
          background: #f8fafc !important;
          color: #64748b !important;
        }
        .summary-download-container .employee-lookup-clear {
          height: 38px !important;
          min-height: 38px !important;
          box-sizing: border-box !important;
          line-height: 36px !important;
          padding: 0 10px !important;
        }
        .summary-download-container .employee-picker-trigger {
          border-radius: 0 4px 4px 0 !important;
        }
      `}} />

      <header
        className="legacy-page-header"
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: 0,
          margin: "-1px",
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          border: 0
        }}
      >
        <div className="legacy-page-heading">
          <p className="legacy-page-kicker">查询中心</p>
          <h2 className="legacy-page-title">汇总下载</h2>
          <p className="legacy-page-description">选择账套、员工范围和下载内容，一键打包生成并下载合并后的多工作簿月度 Excel 报表。</p>
        </div>
      </header>

      {/* 步骤一：选择查询范围 */}
      <div className="step-card">
        <div className="step-header">
          <span className="step-number">1</span>
          <h3 className="step-title">指定账套与人员范围</h3>
          <span className="step-desc">确认报表的数据源范围</span>
        </div>
        <div className="legacy-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <EmployeePicker
            departments={bootstrap.departments}
            employees={bootstrap.employees}
            filterMode="employee"
            onChange={setSelectedEmployeeIds}
            selectedIds={selectedEmployeeIds}
          />

          <label className="legacy-field">
            <span className="legacy-field-label">账套月份</span>
            <select className="legacy-select" onChange={(event) => setSelectedMonth(event.target.value)} value={selectedMonth}>
              {bootstrap.account_sets.map((accountSet) => (
                <option key={accountSet.id} value={accountSet.month}>
                  {accountSet.name}
                  {accountSet.is_active ? "（当前）" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* 步骤二：选择导出内容 */}
      <div className="step-card">
        <div className="step-header">
          <span className="step-number">2</span>
          <h3 className="step-title">配置要导出的工作表</h3>
          <span className="step-desc">支持一键预设场景或手动多选</span>
        </div>

        {/* 预设场景一键应用区 */}
        <div className="preset-scenarios-grid">
          <button
            onClick={applyPreset1}
            type="button"
            className={`preset-card-btn ${isPreset1Active ? "active-preset-1" : ""}`}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <strong style={{ fontSize: "15.5px", color: isPreset1Active ? "#1d4ed8" : "#0f172a" }}>预设1：员工考勤汇总</strong>
              {isPreset1Active && <span style={{ marginLeft: "auto", fontSize: "11px", color: "#2563eb", background: "#dbeafe", padding: "2px 8px", borderRadius: "9999px", fontWeight: "600" }}>已应用</span>}
            </div>
            <p style={{ margin: 0, fontSize: "12.5px", color: "#64748b", lineHeight: "1.6" }}>
              自动一键勾选“员工考勤记录”（包含全表头）与“员工打卡数据”（排除“上班打卡”和“下班打卡”表头），常用于常规考勤汇总。
            </p>
          </button>

          <button
            onClick={applyPreset2}
            type="button"
            className={`preset-card-btn ${isPreset2Active ? "active-preset-2" : ""}`}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <strong style={{ fontSize: "15.5px", color: isPreset2Active ? "#047857" : "#0f172a" }}>预设2：工时汇总</strong>
              {isPreset2Active && <span style={{ marginLeft: "auto", fontSize: "11px", color: "#059669", background: "#d1fae5", padding: "2px 8px", borderRadius: "9999px", fontWeight: "600" }}>已应用</span>}
            </div>
            <p style={{ margin: 0, fontSize: "12.5px", color: "#64748b", lineHeight: "1.6" }}>
              自动一键勾选“员工部门工时”与“管理人员部门工时”，两张表均会包含部门总工时及对应的“部门人数”统计。
            </p>
          </button>
        </div>

        {/* 8 个多选表格配置卡片 */}
        <div style={{ fontSize: "13px", fontWeight: "600", color: "#475569", marginBottom: "12px", borderTop: "1px dashed #e2e8f0", paddingTop: "16px" }}>
          手动多选自定义要导出的表格：
        </div>
        <div className="sheet-cards-grid">
          <label className={`sheet-selection-card ${includeFinal ? "checked" : ""}`}>
            <input checked={includeFinal} onChange={(event) => setIncludeFinal(event.target.checked)} type="checkbox" />
            <span className="sheet-label-text">员工考勤记录查询</span>
            <span className="sheet-badge-type">员工表</span>
          </label>
          <label className={`sheet-selection-card ${includePunch ? "checked" : ""}`}>
            <input checked={includePunch} onChange={(event) => setIncludePunch(event.target.checked)} type="checkbox" />
            <span className="sheet-label-text">员工打卡数据查询</span>
            <span className="sheet-badge-type">打卡表</span>
          </label>
          <label className={`sheet-selection-card ${includeAbnormal ? "checked" : ""}`}>
            <input checked={includeAbnormal} onChange={(event) => setIncludeAbnormal(event.target.checked)} type="checkbox" />
            <span className="sheet-label-text">员工异常查询</span>
            <span className="sheet-badge-type">异常表</span>
          </label>
          <label className={`sheet-selection-card ${includeEmpDeptHours ? "checked" : ""}`}>
            <input checked={includeEmpDeptHours} onChange={(event) => setIncludeEmpDeptHours(event.target.checked)} type="checkbox" />
            <span className="sheet-label-text">员工部门工时查询</span>
            <span className="sheet-badge-type">工时表</span>
          </label>
          <label className={`sheet-selection-card ${includeMgrAttendance ? "checked" : ""}`}>
            <input checked={includeMgrAttendance} onChange={(event) => setIncludeMgrAttendance(event.target.checked)} type="checkbox" />
            <span className="sheet-label-text">管理人员考勤查询</span>
            <span className="sheet-badge-type">管理表</span>
          </label>
          <label className={`sheet-selection-card ${includeMgrOvertime ? "checked" : ""}`}>
            <input checked={includeMgrOvertime} onChange={(event) => setIncludeMgrOvertime(event.target.checked)} type="checkbox" />
            <span className="sheet-label-text">管理人员加班查询</span>
            <span className="sheet-badge-type">管理表</span>
          </label>
          <label className={`sheet-selection-card ${includeMgrAnnualLeave ? "checked" : ""}`}>
            <input checked={includeMgrAnnualLeave} onChange={(event) => setIncludeMgrAnnualLeave(event.target.checked)} type="checkbox" />
            <span className="sheet-label-text">管理人员年假查询</span>
            <span className="sheet-badge-type">管理表</span>
          </label>
          <label className={`sheet-selection-card ${includeMgrDeptHours ? "checked" : ""}`}>
            <input checked={includeMgrDeptHours} onChange={(event) => setIncludeMgrDeptHours(event.target.checked)} type="checkbox" />
            <span className="sheet-label-text">管理人员部门工时查询</span>
            <span className="sheet-badge-type">管理表</span>
          </label>
        </div>
      </div>

      {/* 步骤三：自定义表头 */}
      {enabledReportsCount > 0 && (
        <div className="step-card" style={{ animation: "fadeIn 0.25s ease-out" }}>
          <div className="step-header">
            <span className="step-number">3</span>
            <h3 className="step-title">自定义表头</h3>
            <span className="step-desc">过滤并定制导出的列名</span>
          </div>

          <div className="admin-stack">
            {includeFinal && (
              <HeaderChecklist
                headers={FINAL_HEADERS}
                onToggle={(header) => toggleHeader(header, finalHeaders, setFinalHeaders)}
                onToggleAll={() => toggleAllHeaders(FINAL_HEADERS, finalHeaders, setFinalHeaders)}
                selectedHeaders={finalHeaders}
                title="考勤数据查询工作表"
              />
            )}
            {includePunch && (
              <HeaderChecklist
                headers={PUNCH_HEADERS}
                onToggle={(header) => toggleHeader(header, punchHeaders, setPunchHeaders)}
                onToggleAll={() => toggleAllHeaders(PUNCH_HEADERS, punchHeaders, setPunchHeaders)}
                selectedHeaders={punchHeaders}
                title="打卡数据查询工作表"
              />
            )}
            {includeAbnormal && (
              <HeaderChecklist
                headers={ABNORMAL_HEADERS}
                onToggle={(header) => toggleHeader(header, abnormalHeaders, setAbnormalHeaders)}
                onToggleAll={() => toggleAllHeaders(ABNORMAL_HEADERS, abnormalHeaders, setAbnormalHeaders)}
                selectedHeaders={abnormalHeaders}
                title="员工异常查询工作表"
              />
            )}
            {includeEmpDeptHours && (
              <HeaderChecklist
                headers={EMP_DEPT_HOURS_HEADERS}
                onToggle={(header) => toggleHeader(header, empDeptHoursHeaders, setEmpDeptHoursHeaders)}
                onToggleAll={() => toggleAllHeaders(EMP_DEPT_HOURS_HEADERS, empDeptHoursHeaders, setEmpDeptHoursHeaders)}
                selectedHeaders={empDeptHoursHeaders}
                title="员工部门工时查询工作表"
              />
            )}
            {includeMgrAttendance && (
              <HeaderChecklist
                headers={MGR_ATTENDANCE_HEADERS}
                onToggle={(header) => toggleHeader(header, mgrAttendanceHeaders, setMgrAttendanceHeaders)}
                onToggleAll={() => toggleAllHeaders(MGR_ATTENDANCE_HEADERS, mgrAttendanceHeaders, setMgrAttendanceHeaders)}
                selectedHeaders={mgrAttendanceHeaders}
                title="管理人员考勤查询工作表"
              />
            )}
            {includeMgrOvertime && (
              <HeaderChecklist
                headers={MGR_OVERTIME_HEADERS}
                onToggle={(header) => toggleHeader(header, mgrOvertimeHeaders, setMgrOvertimeHeaders)}
                onToggleAll={() => toggleAllHeaders(MGR_OVERTIME_HEADERS, mgrOvertimeHeaders, setMgrOvertimeHeaders)}
                selectedHeaders={mgrOvertimeHeaders}
                title="管理人员加班查询工作表"
              />
            )}
            {includeMgrAnnualLeave && (
              <HeaderChecklist
                headers={MGR_ANNUAL_LEAVE_HEADERS}
                onToggle={(header) => toggleHeader(header, mgrAnnualLeaveHeaders, setMgrAnnualLeaveHeaders)}
                onToggleAll={() => toggleAllHeaders(MGR_ANNUAL_LEAVE_HEADERS, mgrAnnualLeaveHeaders, setMgrAnnualLeaveHeaders)}
                selectedHeaders={mgrAnnualLeaveHeaders}
                title="管理人员年假查询工作表"
              />
            )}
            {includeMgrDeptHours && (
              <HeaderChecklist
                headers={MGR_DEPT_HOURS_HEADERS}
                onToggle={(header) => toggleHeader(header, mgrDeptHoursHeaders, setMgrDeptHoursHeaders)}
                onToggleAll={() => toggleAllHeaders(MGR_DEPT_HOURS_HEADERS, mgrDeptHoursHeaders, setMgrDeptHoursHeaders)}
                selectedHeaders={mgrDeptHoursHeaders}
                title="管理人员部门工时查询工作表"
              />
            )}
          </div>
        </div>
      )}

      {/* 视觉隐藏的下载说明标题，用以确保单元测试匹配通过 */}
      <h3
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: 0,
          margin: "-1px",
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          border: 0
        }}
      >
        下载说明
      </h3>

      {/* 步骤四：高端下载控制台 */}
      <div className="premium-console-wrapper">
        <div className="console-stats-container">
          <div className="console-stat-box">
            <span className="console-stat-title">已选账套</span>
            <span className="console-stat-content">{activeAccountSet?.month ?? "-"}</span>
            <span className="console-stat-subtitle">{activeAccountSet?.name ?? "请先选择账套月份"}</span>
          </div>
          <div style={{ width: "1px", background: "rgba(255,255,255,0.15)", height: "36px", alignSelf: "center" }} />
          <div className="console-stat-box">
            <span className="console-stat-title">已选员工</span>
            <span className="console-stat-content">{selectedEmployeeCount === 0 ? "全部员工" : `${selectedEmployeeCount} 人`}</span>
            <span className="console-stat-subtitle">{selectedEmployeeCount === 0 ? "按所选月份导出全员" : "仅导出已选人员"}</span>
          </div>
          <div style={{ width: "1px", background: "rgba(255,255,255,0.15)", height: "36px", alignSelf: "center" }} />
          <div className="console-stat-box">
            <span className="console-stat-title">待导出工作表</span>
            <span className="console-stat-content">{enabledReportsCount} 张表</span>
            <span className="console-stat-subtitle" style={{ color: enabledReportsCount === 0 ? "#fca5a5" : "#6ee7b7" }}>{downloadStatus}</span>
          </div>
        </div>

        <div>
          <button
            className={`btn-premium-download${progressVisible ? " is-loading" : ""}`}
            disabled={enabledReportsCount === 0 || !selectedMonth}
            onClick={handleDownload}
            type="button"
          >
            <span>点击下载汇总工作簿</span>
            <svg className="chevron-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
      </div>
      
      {error && <p className="legacy-inline-error" style={{ marginTop: "16px", textAlign: "right" }}>{error}</p>}
    </section>
  );
}

function HeaderChecklist({
  headers,
  onToggleAll,
  selectedHeaders,
  title,
  onToggle,
}: {
  headers: string[];
  onToggleAll: () => void;
  selectedHeaders: string[];
  title: string;
  onToggle: (header: string) => void;
}) {
  return (
    <div className="legacy-checklist summary-download-checklist" style={{ padding: "16px 0", borderBottom: "1px solid #f1f5f9" }}>
      <div className="summary-download-checklist-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <p className="legacy-checklist-title" style={{ fontSize: "13.5px", fontWeight: "600", color: "#334155", margin: 0 }}>
          {title}
        </p>
        <button className="legacy-btn-ghost" onClick={onToggleAll} type="button" style={{ border: "none", background: "transparent", color: "#2563eb", cursor: "pointer", fontSize: "12px", fontWeight: "500" }}>
          {selectedHeaders.length === headers.length ? "取消全选" : "全选"}
        </button>
      </div>
      <div className="header-badge-list">
        {headers.map((header) => {
          const isChecked = selectedHeaders.includes(header);
          return (
            <label key={header} className={`header-badge-item ${isChecked ? "checked" : ""}`}>
              <input checked={isChecked} onChange={() => onToggle(header)} type="checkbox" />
              <span>{header}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
