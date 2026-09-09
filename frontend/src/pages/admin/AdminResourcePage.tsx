import { useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import { fetchAdminRows } from "../../api/admin";
import QueryTable from "../../components/query/QueryTable";
import ErrorState from "../../components/feedback/ErrorState";
import LoadingState from "../../components/feedback/LoadingState";

interface AdminColumn {
  key: string;
  label: string;
  format?: (value: unknown, row: Record<string, unknown>) => string | number;
}

interface AdminResourcePageProps {
  title: string;
  description: string;
  endpoint: string;
  columns: AdminColumn[];
}

export default function AdminResourcePage({ title, description, endpoint, columns }: AdminResourcePageProps) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadRows() {
      try {
        const payload = await fetchAdminRows<unknown>(endpoint);
        if (!mounted) {
          return;
        }
        const normalized = Array.isArray(payload)
          ? payload
          : Array.isArray((payload as { rows?: unknown[] }).rows)
            ? ((payload as { rows: unknown[] }).rows as Array<Record<string, unknown>>)
            : [];
        setRows(normalized);
        setError("");
      } catch (caughtError) {
        if (!mounted) {
          return;
        }
        setError(caughtError instanceof ApiError ? caughtError.message : "后台数据加载失败");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadRows();
    return () => {
      mounted = false;
    };
  }, [endpoint]);

  if (isLoading) {
    return <LoadingState message="正在加载后台页面..." variant="table" />;
  }

  if (error) {
    return <ErrorState description={error} title={`${title}加载失败`} />;
  }

  return (
    <section className="legacy-page-section">
      <header className="legacy-page-header">
        <div className="legacy-page-heading">
          <p className="legacy-page-kicker">后台管理</p>
          <h2 className="legacy-page-title">{title}</h2>
          <p className="legacy-page-description">{description}</p>
        </div>
        <dl className="legacy-page-side-info">
          <div className="legacy-page-side-item">
            <dt>记录数量</dt>
            <dd>{rows.length}</dd>
          </div>
          <div className="legacy-page-side-item">
            <dt>加载状态</dt>
            <dd>已就绪</dd>
          </div>
        </dl>
      </header>
      <section className="legacy-surface admin-resource-panel">
        <div className="admin-resource-panel-head">
          <div>
            <p className="admin-resource-panel-kicker">资源列表</p>
            <p className="admin-resource-panel-title">{title}</p>
            <p className="admin-resource-panel-description">下方表格展示当前后台资源记录，可结合左侧菜单继续切换到其它维护入口。</p>
          </div>
          <span className="admin-resource-panel-meta">共 {rows.length} 条记录</span>
        </div>
        <QueryTable
          headers={columns.map((column) => column.label)}
          rows={rows.map((row) =>
            columns.map((column) => {
              const value = row[column.key];
              if (column.format) {
                return column.format(value, row);
              }
              if (Array.isArray(value)) {
                return value.length ? JSON.stringify(value) : "";
              }
              if (value && typeof value === "object") {
                return JSON.stringify(value);
              }
              return value === null || value === undefined ? "" : String(value);
            }),
          )}
        />
      </section>
    </section>
  );
}
