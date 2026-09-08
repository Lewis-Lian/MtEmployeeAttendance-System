import type { ReactNode } from "react";

type EmployeeBatchToolbarProps = {
  batchAction: string;
  onApply: () => void;
  onBatchActionChange: (action: string) => void;
  onClear: () => void;
  onDelete: () => void;
  renderValueControl: () => ReactNode;
  selectedCount: number;
};

const batchActions = [
  ["set_name", "更改姓名"],
  ["set_emp_no", "更改人员编号"],
  ["set_department", "更改部门"],
  ["set_shift", "更改班次"],
  ["set_manager", "设置人员类型"],
  ["set_nursing", "设置哺乳假"],
  ["set_employee_stats_attendance_source", "设置员工考勤统计来源"],
  ["set_manager_stats_attendance_source", "设置管理人员考勤统计来源"],
] as const;

export default function EmployeeBatchToolbar({
  batchAction,
  onApply,
  onBatchActionChange,
  onClear,
  onDelete,
  renderValueControl,
  selectedCount,
}: EmployeeBatchToolbarProps) {
  const actionSelector = (
    <select
      aria-label="批量操作"
      className="form-select employee-batch-toolbar__action"
      id="employeeBatchAction"
      onChange={(event) => onBatchActionChange(event.target.value)}
      value={batchAction}
    >
      <option value="">选择批量操作</option>
      {batchActions.map(([value, label]) => (
        <option key={value} value={value}>{label}</option>
      ))}
    </select>
  );
  return (
    <div className="employee-batch-toolbar" role="region" aria-label="员工批量操作">
      <div className="employee-batch-toolbar__summary">
        <span className="employee-batch-toolbar__checkmark" aria-hidden="true">✓</span>
        <span>已选择</span>
        <strong>{selectedCount}</strong>
        <span>人</span>
      </div>

      <div className="employee-batch-toolbar__controls">
        <label className="sr-only" htmlFor="employeeBatchAction">批量操作</label>
        {actionSelector}
        {batchAction ? <div className="employee-batch-toolbar__value">{renderValueControl()}</div> : null}
      </div>
      <div className="employee-batch-toolbar__buttons">
        <button className="account-action-button account-action-button--primary" onClick={onApply} type="button">应用到已选</button>
        <button className="account-action-button account-action-button--danger" onClick={onDelete} type="button">批量删除</button>
        <button className="employee-batch-toolbar__clear" onClick={onClear} type="button">清空选择</button>
      </div>
    </div>
  );
}
