import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { fetchAdminLateOffsetLeaves, type LateOffsetLeaveRow } from "../../api/admin";
import ErrorState from "../feedback/ErrorState";
import LoadingState from "../feedback/LoadingState";

interface LateOffsetLeavesModalProps {
  empId: number;
  empNo: string;
  empName: string;
  month: string;
  onClose: () => void;
}

// 迟到冲抵页的行内"请假记录"弹窗：展示该人员当前账套月的全部请假单
export default function LateOffsetLeavesModal({
  empId,
  empNo,
  empName,
  month,
  onClose,
}: LateOffsetLeavesModalProps) {
  const [rows, setRows] = useState<LateOffsetLeaveRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setLoadError(null);
    fetchAdminLateOffsetLeaves(empId, month)
      .then((payload) => {
        if (mounted) {
          setRows(payload.rows ?? []);
        }
      })
      .catch((caughtError: unknown) => {
        if (mounted) {
          setLoadError(caughtError instanceof Error ? caughtError.message : "请假记录加载失败");
        }
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [empId, month]);

  function renderModal() {
    return (
      <div
        aria-label="请假记录"
        aria-modal="true"
        className="master-modal-backdrop"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
        role="dialog"
      >
        <div className="master-modal late-offset-leaves-modal">
          <div className="master-modal-header">
            <div>
              <h2>请假记录</h2>
              <div className="attendance-override-edit-meta">
                {`${empNo} - ${empName} / ${month || "-"}（当月全部请假单）`}
              </div>
            </div>
            <button aria-label="关闭" className="master-modal-close" onClick={onClose} type="button">
              ×
            </button>
          </div>
          <div className="master-modal-body">
            {isLoading ? (
              <LoadingState message="正在加载请假记录..." variant="table" />
            ) : loadError ? (
              <ErrorState description={loadError} title="请假记录加载失败" />
            ) : rows.length ? (
              <table className="late-offset-leaves-table">
                <thead>
                  <tr>
                    <th>请假单号</th>
                    <th>类型</th>
                    <th>开始时间</th>
                    <th>结束时间</th>
                    <th>时长(小时)</th>
                    <th>审批状态</th>
                    <th>事由</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.leave_no}>
                      <td>{row.leave_no}</td>
                      <td>{row.leave_type}</td>
                      <td>{row.start_time}</td>
                      <td>{row.end_time}</td>
                      <td>{row.duration}</td>
                      <td>{row.approval_status || "-"}</td>
                      <td className="late-offset-leaves-reason">{row.reason || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="late-offset-leaves-empty">当月没有请假记录</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return createPortal(renderModal(), document.body);
}
