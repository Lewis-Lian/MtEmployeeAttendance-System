interface QueryProgressOverlayProps {
  active: boolean;
  progress: number;
  text: string;
  className?: string;
}

const MILESTONES = [0, 33, 66, 100];

export default function QueryProgressOverlay({ active, progress, text, className = "" }: QueryProgressOverlayProps) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div className={`query-progress-overlay ${active ? "is-active" : ""} ${className}`.trim()} role="status">
      <div className="query-progress-card">
        <div className="query-progress-heading">
          <span className="query-progress-eyebrow">PROCESSING</span>
          <span className="query-progress-percent">{safeProgress}%</span>
        </div>
        <div
          aria-label="处理进度"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={safeProgress}
          className="query-progress-track"
          role="progressbar"
        >
          <span className="query-progress-fill" style={{ transform: `scaleX(${safeProgress / 100})` }} />
          <span className="query-progress-sweep" />
          <span className="query-progress-milestones" aria-hidden="true">
            {MILESTONES.map((milestone) => (
              <span
                className={`query-progress-milestone ${safeProgress >= milestone ? "is-reached" : ""}`}
                key={milestone}
                role="presentation"
              />
            ))}
          </span>
        </div>
        <p className="query-progress-text">{text}</p>
      </div>
    </div>
  );
}
