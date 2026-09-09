import type { ReactNode } from "react";
import "../../styles/components/attendance-calendar.css";
import "../../styles/components/loading-skeleton.css";

type LoadingVariant =
  | "home"
  | "table"
  | "form"
  | "calendar"
  | "navigation"
  | "query-page"
  | "admin-page"
  | "account-page"
  | "account-list"
  | "account-center"
  | "summary-download"
  | "database-unlock"
  | "attendance-override-modal";

interface LoadingStateProps {
  message?: ReactNode;
  variant?: LoadingVariant;
  contentOnly?: boolean;
  filterFields?: number;
  headers?: string[];
}

export default function LoadingState({
  message = "正在加载数据...",
  variant = "table",
  contentOnly = false,
  filterFields = 3,
  headers,
}: LoadingStateProps) {
  const layoutClass =
    variant === "query-page"
      ? " query-page-shell employee-dashboard-page"
      : variant === "account-center" || variant === "account-page" || variant === "account-list"
        ? " account-center-page"
        : variant === "summary-download"
          ? " legacy-page-section summary-download-container"
          : variant === "admin-page"
            ? " legacy-page-section"
            : variant === "database-unlock"
              ? " database-unlock-loading"
              : "";

  return (
    <section aria-busy="true" aria-live="polite" className={`legacy-feedback-block legacy-loading-state${layoutClass}`} role="status">
      <LoadingSkeleton contentOnly={contentOnly} filterFields={filterFields} headers={headers} variant={variant} />
      <p className="legacy-loading-announcement">{message}</p>
    </section>
  );
}

function LoadingSkeleton({
  variant,
  contentOnly,
  filterFields = 3,
  headers,
}: Pick<LoadingStateProps, "variant" | "contentOnly" | "filterFields" | "headers">) {
  if (variant === "home") {
    return (
      <div aria-hidden="true" className="legacy-loading-skeleton legacy-loading-skeleton--home">
        <div className="qh-editorial-hero legacy-loading-skeleton-kpis">
          <div className="qh-editorial-lead">
            <SkeletonLine width="76px" />
            <SkeletonLine height="62px" width="128px" />
            <div className="qh-editorial-narrative"><SkeletonLine width="92%" /><SkeletonLine width="64%" /></div>
          </div>
          <div className="qh-editorial-stats">
            {[0, 1, 2].map((item) => <div className="qh-editorial-stat" key={item}><SkeletonLine width="72px" /><SkeletonLine height="38px" width="92px" /></div>)}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "query-page") {
    return (
      <>
        <DecorativeSpheres />
        <aside aria-hidden="true" className="query-filter-rail loading-query-filter">
          <div className="query-filter-heading">
            <SkeletonLine width="86px" />
            <SkeletonLine height="28px" width="112px" />
            <SkeletonLine width="88%" />
            <SkeletonLine width="64%" />
          </div>
          <div className="query-filter-body">
            {Array.from({ length: filterFields }, (_, item) => <SkeletonField key={item} />)}
            <div className="query-filter-actions"><SkeletonLine height="36px" width="84px" /><SkeletonLine height="36px" width="104px" /></div>
          </div>
        </aside>
        <section aria-hidden="true" className="query-workspace">
          <div className="card query-result-panel"><div className="query-result-table"><TableSkeleton headers={headers} /></div></div>
        </section>
      </>
    );
  }

  if (variant === "account-center") {
    return (
      <div aria-hidden="true" className="account-page-stack loading-account-center">
        <div className="account-top-control-row">
          <div className="account-panel-selector">
            {["账套设置", "上传原始文档", "员工计算", "管理人员计算"].map((label) => (
              <div className="loading-account-action" key={label}>
                <SkeletonLine height="14px" width="14px" />
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="active-account-set-summary-bar">
            {[
              { label: "当前激活账套：", width: "100px" },
              { label: "账套状态：", width: "48px" },
              { label: "厂休天数：", width: "32px" },
              { label: "福利天数：", width: "32px" },
            ].map(({ label, width }) => (
              <div className="loading-account-summary-item" key={label}>
                <span>{label}</span>
                <SkeletonLine height="18px" width={width} />
              </div>
            ))}
          </div>
        </div>
        <div className="account-workflow">
          <div className="account-workflow-main">
            <div className="account-card-header">
              <span>账套导入记录</span>
              <span className="account-card-header-note">按当前选中账套展示</span>
            </div>
            <div className="card query-result-panel"><div className="query-result-table"><TableSkeleton headers={headers} /></div></div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "account-page") {
    return (
      <div aria-hidden="true" className="account-page-stack loading-account-page">
        <div className="account-top-control-row"><div className="account-panel-selector"><SkeletonLine height="36px" width="104px" /><SkeletonLine height="36px" width="164px" /></div><div className="active-account-set-summary-bar"><SkeletonLine width="260px" /></div></div>
        <div className="account-card-header master-list-header"><SkeletonLine height="22px" width="110px" /><SkeletonLine height="32px" width="72px" /></div>
        <div className="master-filter-panel"><div className="master-filter-grid"><SkeletonField /><SkeletonField /></div></div>
        <div className="card query-result-panel"><div className="query-result-table"><TableSkeleton headers={headers} /></div></div>
      </div>
    );
  }

  if (variant === "account-list") {
    return (
      <div aria-hidden="true" className="account-page-stack loading-account-page">
        <div className="account-card-header master-list-header"><SkeletonLine height="22px" width="110px" /><SkeletonLine height="32px" width="72px" /></div>
        <div className="card query-result-panel"><div className="query-result-table"><TableSkeleton headers={headers} /></div></div>
      </div>
    );
  }

  if (variant === "admin-page") {
    return (
      <div aria-hidden="true" className="loading-admin-page">
        <header className="legacy-page-header"><div className="legacy-page-heading"><SkeletonLine width="86px" /><SkeletonLine height="28px" width="180px" /><SkeletonLine width="320px" /></div><div className="legacy-page-side-info"><SkeletonLine height="48px" width="96px" /><SkeletonLine height="48px" width="96px" /></div></header>
        <section className="legacy-surface admin-resource-panel"><div className="admin-resource-panel-head"><div><SkeletonLine width="76px" /><SkeletonLine height="22px" width="150px" /><SkeletonLine width="300px" /></div><SkeletonLine width="90px" /></div><TableSkeleton headers={headers} /></section>
      </div>
    );
  }

  if (variant === "summary-download") {
    return (
      <div aria-hidden="true" className="loading-summary-download">
        {[0, 1, 2].map((step) => <div className="step-card" key={step}><div className="loading-step-heading"><SkeletonLine height="28px" width="36px" /><div><SkeletonLine height="22px" width="180px" /><SkeletonLine width="280px" /></div></div><div className="loading-step-content">{[0, 1, 2, 3].map((item) => <SkeletonField key={item} />)}</div></div>)}
      </div>
    );
  }

  if (variant === "database-unlock") {
    return (
      <div aria-hidden="true" className="loading-database-unlock-card">
        <SkeletonLine height="26px" width="128px" />
        <SkeletonLine width="88%" />
        <SkeletonLine width="64%" />
        <span className="skeleton-input" />
        <SkeletonLine height="38px" width="100%" />
      </div>
    );
  }

  if (variant === "attendance-override-modal") {
    return <AttendanceOverrideModalSkeleton />;
  }

  if (variant === "form") {
    return (
      <div aria-hidden="true" className="legacy-loading-skeleton legacy-loading-skeleton--form">
        <SkeletonLine height="26px" width="32%" />
        <div className="legacy-loading-skeleton-form-fields">{[0, 1, 2, 3, 4, 5].map((item) => <SkeletonField key={item} />)}</div>
        <SkeletonLine height="36px" width="96px" />
      </div>
    );
  }

  if (variant === "calendar") {
    return <CalendarSkeleton />;
  }

  if (variant === "navigation") {
    return <div aria-hidden="true" className="legacy-loading-skeleton legacy-loading-skeleton--navigation"><span /><span /><span /><span /></div>;
  }

  return (
    <div aria-hidden="true" className="legacy-loading-skeleton legacy-loading-skeleton--table">
      {!contentOnly && <><SkeletonLine height="24px" width="180px" /><div className="legacy-loading-skeleton-toolbar">{[0, 1, 2, 3].map((item) => <SkeletonField key={item} />)}</div></>}
      <TableSkeleton headers={headers} />
    </div>
  );
}

function AttendanceOverrideModalSkeleton() {
  return (
    <div aria-hidden="true" className="attendance-override-calendar-layout loading-attendance-override-modal">
      <div className="attendance-override-calendar-main"><CalendarSkeleton /></div>
      <aside className="attendance-override-calendar-side">
        <div className="attendance-override-daypanel">
          <div className="daypanel-section daypanel-detail"><div className="daypanel-title"><SkeletonLine width="104px" /><SkeletonLine width="48px" /></div><div className="daypanel-rows">{[0, 1, 2, 3].map((item) => <div className="daydetail-row" key={item}><SkeletonLine width="64px" /><SkeletonLine width="92px" /></div>)}</div></div>
          <div className="daypanel-section"><div className="daypanel-title"><SkeletonLine width="96px" /></div><div className="loading-daypanel-chips">{[0, 1, 2, 3].map((item) => <SkeletonLine height="30px" width="64px" key={item} />)}</div></div>
          <div className="daypanel-section"><div className="loading-daypanel-fields">{[0, 1, 2].map((item) => <SkeletonField key={item} />)}</div><div className="daypanel-actions"><SkeletonLine height="34px" width="88px" /><SkeletonLine height="34px" width="88px" /></div></div>
        </div>
      </aside>
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div aria-hidden="true" className="legacy-loading-skeleton legacy-loading-skeleton--calendar">
      <div className="attendance-calendar-summary">{[0, 1, 2, 3].map((item) => <SkeletonLine height="24px" width="80px" key={item} />)}</div>
      <div className="attendance-calendar-grid">
        {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((day) => <div className="attendance-calendar-weekday" key={day}>{day}</div>)}
        {Array.from({ length: 35 }, (_, index) => <div className="attendance-calendar-cell" key={index}><SkeletonLine width="18px" /><SkeletonLine width="70%" /><SkeletonLine width="48%" /></div>)}
      </div>
    </div>
  );
}

function TableSkeleton({ headers }: { headers?: string[] }) {
  const safeHeaders = headers?.length ? headers : ["", "", "", "", "", ""];
  return (
    <div className="legacy-loading-skeleton-table">
      <div className="legacy-table-wrap">
        <table className="legacy-table master-table">
          <thead><tr>{safeHeaders.map((label, column) => <th className="legacy-table-head-cell" key={column}><div className="master-static-head">{label || <SkeletonLine width="55%" />}</div></th>)}</tr></thead>
          <tbody>{Array.from({ length: 8 }, (_, row) => <tr key={row}>{safeHeaders.map((_, column) => <td className="legacy-table-body-cell" key={column}><SkeletonLine width={`${45 + ((row + column) % 3) * 15}%`} /></td>)}</tr>)}</tbody>
        </table>
      </div>
      <div className="skeleton-pagination"><SkeletonLine width="100px" /><SkeletonLine height="26px" width="180px" /></div>
    </div>
  );
}

function SkeletonField() {
  return <div className="query-filter-field skeleton-field"><SkeletonLine width="62px" /><span className="skeleton-input" /></div>;
}

function DecorativeSpheres() {
  return <><div className="qh-glow-sphere sphere-1" /><div className="qh-glow-sphere sphere-2" /><div className="qh-glow-sphere sphere-3" /></>;
}

function SkeletonLine({ width = "100%", height = "13px" }: { width?: string; height?: string }) {
  return <span className="skeleton-line" style={{ height, width }} />;
}
