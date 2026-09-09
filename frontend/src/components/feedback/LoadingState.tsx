import type { ReactNode } from "react";

interface LoadingStateProps {
  message?: ReactNode;
}

export default function LoadingState({ message = "正在加载数据..." }: LoadingStateProps) {
  return (
    <section aria-busy="true" aria-live="polite" className="legacy-feedback-block legacy-loading-state" role="status">
      <div aria-hidden="true" className="legacy-loading-visual">
        <span className="legacy-loading-orbit" />
        <span className="legacy-loading-page">
          <span />
          <span />
          <span />
        </span>
      </div>
      <p className="legacy-loading-announcement">{message}</p>
    </section>
  );
}
