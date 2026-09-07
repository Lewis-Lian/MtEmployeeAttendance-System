import type { ReactNode } from "react";

interface LoadingStateProps {
  message?: ReactNode;
}

export default function LoadingState({ message = "正在加载数据..." }: LoadingStateProps) {
  return (
    <section className="legacy-feedback-block legacy-loading-state" role="status">
      <span aria-hidden="true" className="legacy-loading-orb" />
      <p className="legacy-feedback-kicker">系统提示</p>
      <h2 className="legacy-feedback-title">正在处理</h2>
      <p className="legacy-feedback-body">{message}</p>
    </section>
  );
}
