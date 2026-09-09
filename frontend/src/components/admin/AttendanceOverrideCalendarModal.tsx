import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  clearAdminDailyOverride,
  editLeaveRecord,
  fetchAdminDailyOverrideCalendar,
  restoreLeaveRecord,
  revokeLeaveRecord,
  saveAdminDailyOverride,
  saveAdminDailyOverrideBatch,
  type DailyOverrideBatchPayload,
  type DailyOverrideSavePayload,
} from "../../api/admin";
import AttendanceCalendarGrid from "../attendance/AttendanceCalendarGrid";
import ErrorState from "../feedback/ErrorState";
import LoadingState from "../feedback/LoadingState";
import { useNotification } from "../feedback/Notification";
import type {
  AttendanceCalendarData,
  AttendanceCalendarLeave,
  DailyAttendanceOverrideValues,
} from "../../types/query";

// 状态枚举与后端 services/daily_override_service.py 保持一致
// 出勤类状态通过点击格子循环切换（ATTENDANCE_CYCLE），假种在下方面板选择
export const EMPLOYEE_LEAVE_STATUSES = ["病假", "工伤", "丧假", "事假", "补休（调休）", "婚假"];
export const MANAGER_LEAVE_STATUSES = ["工伤", "出差", "婚假", "丧假"];

// 批量设置面板的状态选项（出勤类 + 假种），与后端 *_DAILY_STATUSES 保持一致
export const EMPLOYEE_DAILY_STATUS_OPTIONS = ["全勤", "上午出勤", "下午出勤", "缺勤", ...EMPLOYEE_LEAVE_STATUSES];
export const MANAGER_DAILY_STATUS_OPTIONS = ["全勤", "上午出勤", "下午出勤", "缺勤", ...MANAGER_LEAVE_STATUSES];

// 批量面板下拉的哨兵值：不动该字段 / 清除状态恢复跟随系统
const BATCH_STATUS_CLEAR = "__clear__";
type BatchActualChoice = "keep" | "on" | "off";

// 快速连点合并为一次保存请求的等待窗口
const SAVE_DEBOUNCE_MS = 350;

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// 点击格子的出勤状态循环顺序：缺勤/无修正 → 全勤（回绕，不经过"跟随系统"；恢复跟随系统走清除修正）
const ATTENDANCE_CYCLE = ["全勤", "上午出勤", "下午出勤", "缺勤"];

function nextCycleStatus(current: string | null | undefined): string {
  const index = ATTENDANCE_CYCLE.indexOf(current ?? "");
  return ATTENDANCE_CYCLE[(index + 1) % ATTENDANCE_CYCLE.length];
}

interface OverrideCalendarEmployee {
  id: number;
  emp_no: string;
  name: string;
}

interface AttendanceOverrideCalendarModalProps {
  editTitle: string;
  employee: OverrideCalendarEmployee;
  month: string;
  isManager: boolean;
  isLocked: boolean;
  /** 外层列表行存在月度修正时提示：最终应用值以月度修正为准 */
  hasMonthlyOverride: boolean;
  onClose: () => void;
  onRowRefresh: (row: unknown) => void;
}

interface DetailFormState {
  workHours: string;
  lateMinutes: string;
  earlyLeaveMinutes: string;
  eveningOvertime: TriChoice;
  actualAttendance: TriChoice;
  remark: string;
}

// 单日面板布尔修正字段的三选：""（不动，跟随系统/保持原值）| "on"（算）| "off"（不算）
type TriChoice = "" | "on" | "off";

const TRI_CHOICES = [["", "不动"], ["on", "算"], ["off", "不算"]] as const;

function triChoiceFrom(value: boolean | null | undefined): TriChoice {
  if (value === true) return "on";
  if (value === false) return "off";
  return "";
}

function triChoiceToBool(choice: TriChoice, current: boolean | null | undefined): boolean | null {
  if (choice === "on") return true;
  if (choice === "off") return false;
  return current ?? null;
}

const EMPTY_FORM: DetailFormState = {
  workHours: "",
  lateMinutes: "",
  earlyLeaveMinutes: "",
  eveningOvertime: "",
  actualAttendance: "",
  remark: "",
};

// 请假单编辑表单：datetime-local 输入值（YYYY-MM-DDTHH:mm）
interface LeaveEditFormState {
  recordId: number;
  start: string;
  end: string;
  leaveType: string;
}

// "2026-07-15 13:00" <-> "2026-07-15T13:00"（datetime-local 控件格式）
function toDateTimeInput(value: string | undefined): string {
  return (value ?? "").replace(" ", "T").slice(0, 16);
}

function fromDateTimeInput(value: string): string {
  return value.replace("T", " ");
}

export default function AttendanceOverrideCalendarModal({
  editTitle,
  employee,
  month,
  isManager,
  isLocked,
  hasMonthlyOverride,
  onClose,
  onRowRefresh,
}: AttendanceOverrideCalendarModalProps) {
  const notification = useNotification();
  const [calendar, setCalendar] = useState<AttendanceCalendarData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailExpanded, setDetailExpanded] = useState(true);
  const [form, setForm] = useState<DetailFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [multiSelectedDates, setMultiSelectedDates] = useState<string[]>([]);
  const [batchStatus, setBatchStatus] = useState("");
  const [batchActual, setBatchActual] = useState<BatchActualChoice>("keep");
  const [leaveEditForm, setLeaveEditForm] = useState<LeaveEditFormState | null>(null);

  const leaveStatuses = isManager ? MANAGER_LEAVE_STATUSES : EMPLOYEE_LEAVE_STATUSES;
  const batchStatusOptions = isManager ? MANAGER_DAILY_STATUS_OPTIONS : EMPLOYEE_DAILY_STATUS_OPTIONS;
  // 选中 1 天为单选模式；勾选满 2 天及以上自动进入多选（右侧批量面板）
  const isMultiSelect = multiSelectedDates.length >= 2;
  const hasBatchChanges = batchStatus !== "" || batchActual !== "keep";
  const selectedDay = useMemo(
    () => calendar?.days.find((day) => day.date === selectedDate) ?? null,
    [calendar, selectedDate],
  );
  const currentOverride = selectedDay?.override ?? null;
  const selectedDayLeaves = useMemo(
    () => (calendar?.leaves ?? []).filter((item) => item.date === selectedDate),
    [calendar, selectedDate],
  );

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setLoadError(null);
    setCalendar(null);
    setSelectedDate(null);
    setDetailExpanded(true);
    fetchAdminDailyOverrideCalendar(employee.id, month)
      .then((payload) => {
        if (mounted) {
          setCalendar(payload);
        }
      })
      .catch((caughtError: unknown) => {
        if (mounted) {
          setLoadError(caughtError instanceof Error ? caughtError.message : "日历数据加载失败");
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
  }, [employee.id, month]);

  // 选中日变化（或保存成功后数据刷新）时，用该日修正值重置表单
  useEffect(() => {
    setForm({
      workHours: currentOverride?.work_hours == null ? "" : String(currentOverride.work_hours),
      lateMinutes: currentOverride?.late_minutes == null ? "" : String(currentOverride.late_minutes),
      earlyLeaveMinutes: currentOverride?.early_leave_minutes == null ? "" : String(currentOverride.early_leave_minutes),
      eveningOvertime: triChoiceFrom(currentOverride?.is_evening_overtime),
      actualAttendance: triChoiceFrom(currentOverride?.is_actual_attendance),
      remark: currentOverride?.remark ?? "",
    });
    setDetailExpanded(true);
  }, [selectedDate, currentOverride]);

  function buildPayload(overrides: Partial<DailyOverrideSavePayload>): DailyOverrideSavePayload {
    return {
      month,
      emp_id: employee.id,
      date: selectedDate ?? "",
      work_hours: form.workHours,
      late_minutes: form.lateMinutes,
      early_leave_minutes: form.earlyLeaveMinutes,
      is_evening_overtime: triChoiceToBool(form.eveningOvertime, currentOverride?.is_evening_overtime),
      is_actual_attendance: triChoiceToBool(form.actualAttendance, currentOverride?.is_actual_attendance),
      remark: form.remark,
      ...overrides,
    };
  }

  // 乐观更新本地日历的某天修正值（不等保存响应，点击立即生效）
  function patchDayOverride(date: string, patch: Partial<DailyAttendanceOverrideValues>) {
    setCalendar((current) => {
      if (!current) {
        return current;
      }
      const days = current.days.map((day) =>
        day.date === date ? { ...day, override: { ...(day.override ?? {}), ...patch } } : day,
      );
      return { ...current, days };
    });
  }

  // 防抖保存：快速连点只发最后一次；保存成功用后端数据对齐，失败则重拉日历回滚
  const saveTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<{ payload: DailyOverrideSavePayload; successText: string } | null>(null);

  function scheduleSave(payload: DailyOverrideSavePayload, successText: string) {
    pendingSaveRef.current = { payload, successText };
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void flushSave();
    }, SAVE_DEBOUNCE_MS);
  }

  async function flushSave() {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingSaveRef.current;
    if (!pending) {
      return;
    }
    pendingSaveRef.current = null;
    setIsSaving(true);
    try {
      const response = await saveAdminDailyOverride<unknown>(pending.payload);
      setCalendar(response.calendar);
      onRowRefresh(response.row);
      notification.success(pending.successText);
    } catch (caughtError: unknown) {
      notification.error(caughtError instanceof Error ? caughtError.message : "保存失败");
      try {
        setCalendar(await fetchAdminDailyOverrideCalendar(employee.id, month));
      } catch {
        // 重拉失败时保留本地状态，用户可手动刷新
      }
    } finally {
      setIsSaving(false);
    }
  }

  // 弹窗关闭/卸载前把未落盘的防抖修正发出（fire-and-forget）
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const pending = pendingSaveRef.current;
      if (pending) {
        pendingSaveRef.current = null;
        void saveAdminDailyOverride<unknown>(pending.payload).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 请假单作废/恢复/编辑共用：成功用响应中的日历整体刷新（含作废标记）；返回是否成功
  async function runLeaveOperation(
    operation: () => Promise<{ calendar: AttendanceCalendarData }>,
    successText: string,
  ): Promise<boolean> {
    setIsSaving(true);
    try {
      const response = await operation();
      setCalendar(response.calendar);
      notification.success(successText);
      return true;
    } catch (caughtError: unknown) {
      notification.error(caughtError instanceof Error ? caughtError.message : "操作失败");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  function handleLeaveRevoke(recordId: number) {
    void runLeaveOperation(() => revokeLeaveRecord(recordId, month), "已作废请假单");
  }

  function handleLeaveRestore(recordId: number) {
    void runLeaveOperation(() => restoreLeaveRecord(recordId, month), "已恢复请假单");
  }

  function openLeaveEdit(leave: AttendanceCalendarLeave) {
    setLeaveEditForm({
      recordId: leave.id as number,
      start: toDateTimeInput(leave.start_time),
      end: toDateTimeInput(leave.end_time),
      leaveType: leave.leave_type,
    });
  }

  function handleLeaveEditSave() {
    const formState = leaveEditForm;
    if (!formState) {
      return;
    }
    void runLeaveOperation(
      () =>
        editLeaveRecord(formState.recordId, {
          month,
          start_time: fromDateTimeInput(formState.start),
          end_time: fromDateTimeInput(formState.end),
          leave_type: formState.leaveType,
        }),
      "已保存请假单",
    ).then((succeeded) => {
      if (succeeded) {
        setLeaveEditForm(null);
      }
    });
  }

  // 切换选中日时丢弃未提交的请假单编辑表单
  useEffect(() => {
    setLeaveEditForm(null);
  }, [selectedDate]);

  // 点击 1 天为单选（右侧当天面板），单选下再点不同格子连同原选中一起进入多选；
  // 多选中点击格子做勾选/取消，取消到剩 1 天自动回单选；
  // 单选下再次点击同一格循环切换出勤状态，假种在下方面板设置
  function handleCellClick(date: string) {
    if (isMultiSelect) {
      if (isLocked) {
        return;
      }
      const next = multiSelectedDates.includes(date)
        ? multiSelectedDates.filter((item) => item !== date)
        : [...multiSelectedDates, date];
      if (next.length >= 2) {
        setMultiSelectedDates(next);
      } else {
        resetMultiSelection();
        setSelectedDate(next.length === 1 ? next[0] : null);
      }
      return;
    }
    if (selectedDate === date) {
      if (isLocked || !calendar) {
        return;
      }
      const dayOverride = calendar.days.find((day) => day.date === date)?.override ?? null;
      const nextStatus = nextCycleStatus(dayOverride?.status);
      patchDayOverride(date, { status: nextStatus });
      scheduleSave(
        {
          month,
          emp_id: employee.id,
          date,
          status: nextStatus,
          is_evening_overtime: dayOverride?.is_evening_overtime ?? undefined,
          is_actual_attendance: dayOverride?.is_actual_attendance ?? undefined,
          work_hours: dayOverride?.work_hours ?? "",
          late_minutes: dayOverride?.late_minutes ?? "",
          early_leave_minutes: dayOverride?.early_leave_minutes ?? "",
          remark: dayOverride?.remark ?? "",
        },
        `已标记 ${nextStatus}`,
      );
      return;
    }
    if (selectedDate && !isLocked) {
      setMultiSelectedDates([selectedDate, date]);
      setSelectedDate(null);
      return;
    }
    setSelectedDate(date);
  }

  function resetMultiSelection() {
    setMultiSelectedDates([]);
    setBatchStatus("");
    setBatchActual("keep");
  }

  // 多选模式下批量应用状态/实际打卡设置，成功后用后端日历刷新并清空勾选
  async function handleBatchApply() {
    if (multiSelectedDates.length === 0 || isSaving || !hasBatchChanges) {
      return;
    }
    setIsSaving(true);
    try {
      const payload: DailyOverrideBatchPayload = {
        month,
        emp_id: employee.id,
        dates: [...multiSelectedDates],
      };
      if (batchStatus === BATCH_STATUS_CLEAR) {
        payload.status = "";
      } else if (batchStatus) {
        payload.status = batchStatus;
      }
      if (batchActual !== "keep") {
        payload.is_actual_attendance = batchActual === "on";
      }
      const response = await saveAdminDailyOverrideBatch<unknown>(payload);
      setCalendar(response.calendar);
      resetMultiSelection();
      onRowRefresh(response.row);
      notification.success(`已批量应用 ${payload.dates.length} 天`);
    } catch (caughtError: unknown) {
      notification.error(caughtError instanceof Error ? caughtError.message : "批量保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClear() {
    if (!selectedDate || isSaving) {
      return;
    }
    // 丢弃未落盘的防抖保存，避免清除后又落下一条写回修正
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    pendingSaveRef.current = null;
    setIsSaving(true);
    try {
      const response = await clearAdminDailyOverride<unknown>(employee.id, selectedDate);
      setCalendar(response.calendar);
      onRowRefresh(response.row);
      notification.success("已恢复系统口径");
    } catch (caughtError: unknown) {
      notification.error(caughtError instanceof Error ? caughtError.message : "清除失败");
    } finally {
      setIsSaving(false);
    }
  }

  function renderModal() {
    return (
      <div aria-label={editTitle} aria-modal="true" className="master-modal-backdrop attendance-override-edit-backdrop" role="dialog">
        <div className="master-modal attendance-override-calendar-modal">
          <div className="master-modal-header">
            <div>
              <h2>{editTitle}</h2>
              <div className="attendance-override-edit-meta">
                {`${employee.emp_no} - ${employee.name} / ${month || "-"}`}
              </div>
            </div>
            <button aria-label="关闭" className="master-modal-close" onClick={onClose} type="button">
              ×
            </button>
          </div>
          <div className="master-modal-body attendance-override-calendar-body">
            {hasMonthlyOverride ? (
              <div className="attendance-override-calendar-notice">
                该月存在月度手工修正（Excel 导入），最终应用值以月度修正为准
              </div>
            ) : null}
            {isLocked ? (
              <div className="account-lock-notice is-locked">{month || "-"} 账套已锁定，仅可查看</div>
            ) : null}
            {isLoading ? (
              <LoadingState message="正在加载考勤日历..." variant="calendar" />
            ) : loadError ? (
              <ErrorState description={loadError} title="日历数据加载失败" />
            ) : calendar ? (
              <div className="attendance-override-calendar-layout">
                <div className="attendance-override-calendar-main">
                  <AttendanceCalendarGrid
                    data={calendar}
                    multiSelectedDates={multiSelectedDates}
                    onCellSelect={handleCellClick}
                    selectedDate={selectedDate}
                  />
                </div>
                <aside className="attendance-override-calendar-side">
                  {isMultiSelect ? renderBatchPanel() : selectedDay ? renderDayPanel() : (
                    <div aria-hidden="true" className="daypanel-skeleton">
                      <span className="daypanel-skeleton-title" />
                      <span className="daypanel-skeleton-row" />
                      <span className="daypanel-skeleton-row daypanel-skeleton-row--short" />
                      <span className="daypanel-skeleton-row" />
                      <div className="daypanel-skeleton-block">
                        <span className="daypanel-skeleton-chip" />
                        <span className="daypanel-skeleton-chip" />
                        <span className="daypanel-skeleton-chip" />
                        <span className="daypanel-skeleton-chip" />
                      </div>
                      <div className="daypanel-skeleton-block">
                        <span className="daypanel-skeleton-field" />
                        <span className="daypanel-skeleton-field" />
                        <span className="daypanel-skeleton-field daypanel-skeleton-field--wide" />
                      </div>
                    </div>
                  )}
                </aside>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // 多选模式右侧批量面板：勾选满 2 天后替代当天详情面板
  function renderBatchPanel() {
    return (
      <div className="attendance-override-batch-panel" data-testid="daily-override-batch-panel">
        <div className="daypanel-title">
          <span>批量修正</span>
          <span className="attendance-override-multiselect-count">{`已选 ${multiSelectedDates.length} 天`}</span>
        </div>
        <label className="attendance-override-batch-field">
          <span className="attendance-override-batch-label">考勤状态</span>
          <select
            aria-label="批量考勤状态"
            disabled={isLocked || isSaving}
            onChange={(event) => setBatchStatus(event.target.value)}
            value={batchStatus}
          >
            <option value="">不动</option>
            <option value={BATCH_STATUS_CLEAR}>跟随系统（清除状态）</option>
            {batchStatusOptions.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
        <div aria-label="批量实际打卡" className="attendance-override-batch-field" role="group">
          <span className="attendance-override-batch-label">实际打卡</span>
          <div className="attendance-override-batch-choices">
            {([
              ["keep", "不动"],
              ["on", "算"],
              ["off", "不算"],
            ] as const).map(([value, label]) => (
              <label key={value}>
                <input
                  checked={batchActual === value}
                  disabled={isLocked || isSaving}
                  name="batch-actual-attendance"
                  onChange={() => setBatchActual(value)}
                  type="radio"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="daypanel-actions">
          <button
            className="account-action-button account-action-button--primary"
            disabled={isLocked || isSaving || multiSelectedDates.length === 0 || !hasBatchChanges}
            onClick={() => void handleBatchApply()}
            type="button"
          >
            批量应用
          </button>
          <button
            className="account-action-button"
            disabled={isLocked || isSaving}
            onClick={resetMultiSelection}
            type="button"
          >
            取消全选
          </button>
        </div>
      </div>
    );
  }

  function renderDayPanel() {
    if (!selectedDay) {
      return null;
    }
    const hasOverrideContent = Boolean(
      currentOverride &&
        (currentOverride.status ||
          currentOverride.is_evening_overtime != null ||
          currentOverride.is_actual_attendance != null ||
          currentOverride.work_hours != null ||
          currentOverride.late_minutes != null ||
          currentOverride.early_leave_minutes != null ||
          (currentOverride.remark ?? "").trim()),
    );
    return (
      <div className="attendance-override-daypanel" data-testid="daily-override-panel">
        <div className="daypanel-section daypanel-detail">
          <div className="daypanel-title">
            <span>{selectedDate}</span>
            <span className="daydetail-date-week">{weekdayLabel(selectedDate ?? "")}</span>
            <span className="daypanel-title-hint">原始考勤</span>
          </div>
          <div className="daypanel-rows">
            <div className="daydetail-row">
              <span className="daydetail-label">上班卡</span>
              <span className="daydetail-value">{selectedDay.check_in_times.join(" / ") || "无"}</span>
            </div>
            <div className="daydetail-row">
              <span className="daydetail-label">下班卡</span>
              <span className="daydetail-value">{selectedDay.check_out_times.join(" / ") || "无"}</span>
            </div>
            <div className="daydetail-row">
              <span className="daydetail-label">打卡次数</span>
              <span className="daydetail-value">{selectedDay.punch_count} 次</span>
            </div>
            <div className="daydetail-row">
              <span className="daydetail-label">实出勤</span>
              <span className="daydetail-value">{selectedDay.actual_hours} 小时</span>
            </div>
            {selectedDay.late_minutes > 0 && (
              <div className="daydetail-row">
                <span className="daydetail-label">迟到</span>
                <span className="daydetail-value daydetail-warn">{selectedDay.late_minutes} 分钟</span>
              </div>
            )}
            {selectedDay.early_leave_minutes > 0 && (
              <div className="daydetail-row">
                <span className="daydetail-label">早退</span>
                <span className="daydetail-value daydetail-warn">{selectedDay.early_leave_minutes} 分钟</span>
              </div>
            )}
          </div>
        </div>

        {selectedDayLeaves.length > 0 ? (
          <div className="daypanel-section daypanel-leaves">
            <div className="daypanel-title">
              <span>当日请假单</span>
              <span className="daypanel-title-hint">作废后不参与考勤与扣薪口径</span>
            </div>
            {selectedDayLeaves.map((leave) => (
              <div
                className={`daypanel-leave-item${leave.is_revoked ? " is-revoked" : ""}`}
                key={leave.leave_no ?? `${leave.date}-${leave.start_time ?? ""}`}
              >
                <div className="daypanel-leave-row">
                  <span className="daypanel-leave-type" data-testid="daypanel-leave-type">
                    {leave.leave_type}
                  </span>
                  {leave.is_revoked ? <span className="daypanel-leave-badge">已撤销</span> : null}
                  <span className="daypanel-leave-range">{`${(leave.start_time ?? "").slice(5, 16)} ~ ${(leave.end_time ?? "").slice(5, 16)}`}</span>
                  {leave.leave_no ? <span className="daypanel-leave-no">{leave.leave_no}</span> : null}
                </div>
                {leave.reason ? <div className="daypanel-leave-reason">{leave.reason}</div> : null}
                {leave.id != null ? (
                  <div className="daypanel-leave-actions">
                    {leave.is_revoked ? (
                      <button
                        className="account-action-button"
                        disabled={isLocked || isSaving}
                        onClick={() => handleLeaveRestore(leave.id as number)}
                        type="button"
                      >
                        恢复
                      </button>
                    ) : (
                      <button
                        className="account-action-button"
                        disabled={isLocked || isSaving}
                        onClick={() => handleLeaveRevoke(leave.id as number)}
                        type="button"
                      >
                        作废
                      </button>
                    )}
                    <button
                      className="account-action-button"
                      disabled={isLocked || isSaving || leave.is_revoked}
                      onClick={() => openLeaveEdit(leave)}
                      type="button"
                    >
                      编辑
                    </button>
                  </div>
                ) : null}
                {leaveEditForm && leaveEditForm.recordId === leave.id ? (
                  <div className="daypanel-leave-edit" data-testid="daypanel-leave-edit">
                    <label className="daypanel-field">
                      <span className="daypanel-field-label">假种</span>
                      <select
                        disabled={isLocked || isSaving}
                        onChange={(event) =>
                          setLeaveEditForm((current) => (current ? { ...current, leaveType: event.target.value } : current))
                        }
                        value={leaveEditForm.leaveType}
                      >
                        {(leaveStatuses.includes(leaveEditForm.leaveType)
                          ? leaveStatuses
                          : [leaveEditForm.leaveType, ...leaveStatuses]
                        ).map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="daypanel-field">
                      <span className="daypanel-field-label">开始时间</span>
                      <input
                        disabled={isLocked || isSaving}
                        onChange={(event) =>
                          setLeaveEditForm((current) => (current ? { ...current, start: event.target.value } : current))
                        }
                        type="datetime-local"
                        value={leaveEditForm.start}
                      />
                    </label>
                    <label className="daypanel-field">
                      <span className="daypanel-field-label">结束时间</span>
                      <input
                        disabled={isLocked || isSaving}
                        onChange={(event) =>
                          setLeaveEditForm((current) => (current ? { ...current, end: event.target.value } : current))
                        }
                        type="datetime-local"
                        value={leaveEditForm.end}
                      />
                    </label>
                    <div className="daypanel-actions">
                      <button
                        className="account-action-button account-action-button--primary"
                        disabled={isLocked || isSaving}
                        onClick={handleLeaveEditSave}
                        type="button"
                      >
                        保存请假单
                      </button>
                      <button
                        className="account-action-button"
                        disabled={isLocked || isSaving}
                        onClick={() => setLeaveEditForm(null)}
                        type="button"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="daypanel-section daypanel-status">
          <div className="daypanel-title">
            <span>假种（点击即保存；出勤状态点格子循环切换）</span>
            <span className="daypanel-current-status">{`当前：${currentOverride?.status || "跟随系统"}`}</span>
          </div>
          <div className="daypanel-status-group">
            {leaveStatuses.map((status) => (
              <button
                aria-label={`标记 ${status}`}
                className={`daypanel-status-button${currentOverride?.status === status ? " is-active" : ""}`}
                disabled={isLocked || isSaving}
                key={status}
                onClick={() => {
                  patchDayOverride(selectedDate ?? "", { status });
                  scheduleSave(buildPayload({ status }), `已标记 ${status}`);
                }}
                type="button"
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="daypanel-section daypanel-extra">
          <div className="daypanel-extra-header">
            <button
              className="daypanel-toggle"
              onClick={() => setDetailExpanded((current) => !current)}
              type="button"
            >
              更多信息{detailExpanded ? "▲" : "▼"}
            </button>
            {hasOverrideContent ? (
              <button
                className="account-action-button"
                disabled={isLocked || isSaving}
                onClick={() => void handleClear()}
                type="button"
              >
                清除修正
              </button>
            ) : null}
          </div>
          {detailExpanded ? (
            <div className="daypanel-extra-form">
              <div aria-label="单日晚上加班" className="daypanel-field daypanel-field--tri" role="group" title="确认晚上加班后按 0.5 天出勤计；不动=跟随系统">
                <span className="daypanel-field-label">晚上加班<span className="daypanel-field-sub">0.5 出勤</span></span>
                <div className="attendance-override-batch-choices">
                  {TRI_CHOICES.map(([value, label]) => (
                    <label key={value}>
                      <input
                        checked={form.eveningOvertime === value}
                        disabled={isLocked || isSaving}
                        name="daily-evening-overtime"
                        onChange={() => setForm((current) => ({ ...current, eveningOvertime: value }))}
                        type="radio"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div aria-label="单日实际打卡" className="daypanel-field daypanel-field--tri" role="group" title="算=当天计 1 天实际出勤，不算=不计；不动=按刷卡口径跟随系统">
                <span className="daypanel-field-label">实际打卡<span className="daypanel-field-sub">计 1 天</span></span>
                <div className="attendance-override-batch-choices">
                  {TRI_CHOICES.map(([value, label]) => (
                    <label key={value}>
                      <input
                        checked={form.actualAttendance === value}
                        disabled={isLocked || isSaving}
                        name="daily-actual-attendance"
                        onChange={() => setForm((current) => ({ ...current, actualAttendance: value }))}
                        type="radio"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="daypanel-field">
                <span className="daypanel-field-label">工时（小时）</span>
                <input
                  disabled={isLocked || isSaving}
                  inputMode="decimal"
                  onChange={(event) => setForm((current) => ({ ...current, workHours: event.target.value }))}
                  placeholder="自动"
                  value={form.workHours}
                />
              </label>
              <label className="daypanel-field">
                <span className="daypanel-field-label">迟到分钟</span>
                <input
                  disabled={isLocked || isSaving}
                  inputMode="numeric"
                  onChange={(event) => setForm((current) => ({ ...current, lateMinutes: event.target.value }))}
                  placeholder="自动"
                  value={form.lateMinutes}
                />
              </label>
              <label className="daypanel-field">
                <span className="daypanel-field-label">早退分钟</span>
                <input
                  disabled={isLocked || isSaving}
                  inputMode="numeric"
                  onChange={(event) => setForm((current) => ({ ...current, earlyLeaveMinutes: event.target.value }))}
                  placeholder="自动"
                  value={form.earlyLeaveMinutes}
                />
              </label>
              <label className="daypanel-field daypanel-field-wide">
                <span className="daypanel-field-label">备注</span>
                <textarea
                  disabled={isLocked || isSaving}
                  onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
                  placeholder="可填写修正原因"
                  rows={2}
                  value={form.remark}
                />
              </label>
              <div className="daypanel-actions">
                <button
                  className="account-action-button account-action-button--primary"
                  disabled={isLocked || isSaving}
                  onClick={() => {
                    if (selectedDate) {
                      patchDayOverride(selectedDate, {
                        work_hours: form.workHours === "" ? null : Number(form.workHours),
                        late_minutes: form.lateMinutes === "" ? null : Number(form.lateMinutes),
                        early_leave_minutes: form.earlyLeaveMinutes === "" ? null : Number(form.earlyLeaveMinutes),
                        is_evening_overtime: triChoiceToBool(form.eveningOvertime, currentOverride?.is_evening_overtime),
                        is_actual_attendance: triChoiceToBool(form.actualAttendance, currentOverride?.is_actual_attendance),
                        remark: form.remark,
                      });
                    }
                    scheduleSave(buildPayload({ status: currentOverride?.status ?? "" }), "已保存修正");
                  }}
                  type="button"
                >
                  保存修正
                </button>
              </div>
            </div>
          ) : null}
          {currentOverride?.updated_at ? (
            <div className="attendance-override-daypanel-meta">
              {`最近修正 ${(currentOverride.updated_by_name || "").trim()} ${formatDateTime(currentOverride.updated_at)}`.trim()}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return createPortal(renderModal(), document.body);
}

function weekdayLabel(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return "";
  }
  return WEEKDAYS[new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getDay()];
}

function formatDateTime(value: string): string {
  return value ? value.replace("T", " ").slice(0, 19) : "";
}
