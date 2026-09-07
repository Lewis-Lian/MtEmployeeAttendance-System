export interface QueryNavigationEntry {
  key: string;
  label: string;
  href: string;
  description?: string;
}

export interface QueryNavigationModule {
  slug: string;
  label: string;
  short_label: string;
  description?: string;
  home_href: string;
  entries: QueryNavigationEntry[];
}

export interface QueryEmployee {
  id: number;
  emp_no: string;
  name: string;
  dept_id: number | null;
  dept_name: string;
  is_manager: boolean;
}

export interface AccountSet {
  id: number;
  month: string;
  name: string;
  is_active: boolean;
  is_locked?: boolean;
  factory_rest_days?: number;
  factory_rest_requires_detail?: boolean;
  legacy_factory_rest_days?: number;
  monthly_benefit_days?: number;
}

export interface DepartmentOption {
  id: number;
  dept_no: string;
  dept_name: string;
  parent_id: number | null;
}

export interface QueryBootstrap {
  employees: QueryEmployee[];
  account_sets: AccountSet[];
  departments: DepartmentOption[];
}

export interface HeaderRowsResponse {
  headers: string[];
  rows: Array<Array<string | number | null>>;
}

export interface FactoryRestEntry {
  date: string;
  period: string;
}

export interface HomeSummaryResponse {
  has_data: boolean;
  empty_state: string;
  month: string;
  account_set_name: string;
  support_message?: string;
  manager?: {
    emp_id: number;
    emp_no: string;
    name: string;
    dept_name: string;
  };
  summary?: Record<string, number | string>;
  factory_rest_entries?: FactoryRestEntry[];
}

export interface AttendanceCalendarEmployee {
  id: number;
  emp_no: string;
  name: string;
  dept_name: string;
}

export interface AttendanceCalendarDay {
  date: string;
  check_in_times: string[];
  check_out_times: string[];
  punch_count: number;
  actual_hours: number;
  late_minutes: number;
  early_leave_minutes: number;
  is_half_day: boolean;
  /** 当日计入月度自动考勤的天数。 */
  attendance_days?: number;
  /** 当日实际出勤天数（0/1）：未计入时前端以红点角标标记（含「不算」修正与无刷卡口径） */
  actual_attendance_days: number;
  exception_reason: string;
  override?: DailyAttendanceOverrideValues | null;
}

export interface DailyAttendanceOverrideValues {
  status?: string | null;
  is_evening_overtime?: boolean | null;
  is_actual_attendance?: boolean | null;
  work_hours?: number | null;
  late_minutes?: number | null;
  early_leave_minutes?: number | null;
  remark?: string;
  updated_at?: string | null;
  updated_by_name?: string;
}

export interface AttendanceCalendarOvertime {
  date: string;
  is_evening: boolean;
  is_weekend: boolean;
  is_holiday: boolean;
  hours: number;
}

export interface AttendanceCalendarLeave {
  date: string;
  leave_type: string;
  duration: number;
  leave_no?: string;
  start_time?: string;
  end_time?: string;
  reason?: string;
  approval_status?: string;
  /** 请假单记录 id（作废/恢复/编辑的操作句柄；旧数据可能缺失） */
  id?: number;
  /** 作废单不参与任何口径，仅置灰展示 */
  is_revoked?: boolean;
}

export interface AttendanceCalendarSummary {
  attendance_days: number;
  half_days: number;
  leave_by_type: Array<{ leave_type: string; count: number; days: number }>;
  evening_overtime_hours: number;
  other_overtime_hours: number;
  late_minutes_total: number;
  early_leave_minutes_total: number;
}

export interface AttendanceCalendarData {
  employee: AttendanceCalendarEmployee;
  month: string;
  /** 管理人员逐日记录未覆盖整月时，为兼容历史账套回退月报口径。 */
  attendance_source?: "daily" | "monthly_fallback";
  days: AttendanceCalendarDay[];
  overtimes: AttendanceCalendarOvertime[];
  leaves: AttendanceCalendarLeave[];
  summary: AttendanceCalendarSummary;
}
