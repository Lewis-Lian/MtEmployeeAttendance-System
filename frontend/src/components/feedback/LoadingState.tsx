import type { ReactNode } from "react";
import "../../styles/components/attendance-calendar.css";
import "../../styles/components/loading-skeleton.css";

interface LoadingStateProps {
  message?: ReactNode;
  variant?: "home" | "table" | "form" | "calendar" | "navigation";
  contentOnly?: boolean;
  headers?: string[];
}

export default function LoadingState({ message = "正在加载数据...", variant = "table", contentOnly = false, headers }: LoadingStateProps) {
  return (
    <section aria-busy="true" aria-live="polite" className="legacy-feedback-block legacy-loading-state" role="status">
      <LoadingSkeleton variant={variant} contentOnly={contentOnly} headers={headers} />
      <p className="legacy-loading-announcement">{message}</p>
    </section>
  );
}

function LoadingSkeleton({ variant, contentOnly, headers }: Pick<LoadingStateProps, "variant" | "contentOnly" | "headers">) {
  if (variant === "home") {
    return (
      <div aria-hidden="true" className="legacy-loading-skeleton legacy-loading-skeleton--home">
        <div className="qh-editorial-hero legacy-loading-skeleton-kpis">
          <div className="qh-editorial-lead">
            <p className="qh-editorial-label">本月出勤</p>
            <div className="qh-editorial-attendance"><span className="skeleton-number">00</span><small>天</small></div>
            <p className="qh-editorial-narrative"><SkeletonLine width="92%" /><SkeletonLine width="64%" /></p>
          </div>
          <div className="qh-editorial-stats">
            {["剩余福利", "剩余调休", "迟到早退"].map((label, index) => <div className="qh-editorial-stat" key={label}><span>{label}</span><strong><span className="skeleton-number">00</span><small>{index === 2 ? "分钟" : "天"}</small></strong></div>)}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "form") {
    return (
      <div aria-hidden="true" className="legacy-loading-skeleton legacy-loading-skeleton--form">
        <span className="legacy-loading-skeleton-form-title" />
        <div className="legacy-loading-skeleton-form-fields">
          {[0, 1, 2, 3, 4, 5].map((item) => <div className="skeleton-field" key={item}><SkeletonLine width="32%" /><span className="skeleton-input" /></div>)}
        </div>
        <span className="legacy-loading-skeleton-form-actions" />
      </div>
    );
  }

  if (variant === "calendar") {
    return (
      <div aria-hidden="true" className="legacy-loading-skeleton legacy-loading-skeleton--calendar">
        <div className="attendance-calendar-summary">{[0, 1, 2, 3].map((item) => <SkeletonLine key={item} width="80px" height="24px" />)}</div>
        <div className="attendance-calendar-grid">
          {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((day) => <div className="attendance-calendar-weekday" key={day}>{day}</div>)}
          {Array.from({ length: 35 }, (_, index) => <div className="attendance-calendar-cell" key={index}><SkeletonLine width="18px" /><SkeletonLine width="70%" /><SkeletonLine width="48%" /></div>)}
        </div>
      </div>
    );
  }

  if (variant === "navigation") {
    return (
      <div aria-hidden="true" className="legacy-loading-skeleton legacy-loading-skeleton--navigation">
        <span /><span /><span /><span />
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="legacy-loading-skeleton legacy-loading-skeleton--table">
      {!contentOnly && <><SkeletonLine width="180px" height="24px" /><div className="legacy-loading-skeleton-toolbar">{[0, 1, 2, 3].map((item) => <div className="skeleton-field" key={item}><SkeletonLine width="60px" /><span className="skeleton-input" /></div>)}</div></>}
      <div className="legacy-loading-skeleton-table">
        {headers ? <div className="legacy-table-wrap"><table className="legacy-table master-table"><thead><tr>{headers.map((label, column) => <th className="legacy-table-head-cell" key={column}><div className="master-static-head">{label || <SkeletonLine width="14px" />}</div></th>)}</tr></thead><tbody>{Array.from({ length: 8 }, (_, row) => <tr key={row}>{headers.map((_, column) => <td className="legacy-table-body-cell" key={column}><SkeletonLine width={`${45 + ((row + column) % 3) * 15}%`} /></td>)}</tr>)}</tbody></table></div> :
        Array.from({ length: 9 }, (_, row) => <div className={`skeleton-table-row${row === 0 ? " is-heading" : ""}`} key={row}>{[0, 1, 2, 3, 4, 5].map((column) => <SkeletonLine key={column} width={`${45 + ((row + column) % 3) * 15}%`} />)}</div>)}
        <div className="skeleton-pagination"><SkeletonLine width="100px" /><SkeletonLine width="180px" height="26px" /></div>
      </div>
    </div>
  );
}

function SkeletonLine({ width = "100%", height = "13px" }: { width?: string; height?: string }) {
  return <span className="skeleton-line" style={{ width, height }} />;
}
