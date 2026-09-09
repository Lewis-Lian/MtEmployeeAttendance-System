import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchCalendar = vi.hoisted(() => vi.fn());
const mockSave = vi.hoisted(() => vi.fn());
const mockClear = vi.hoisted(() => vi.fn());
const mockSaveBatch = vi.hoisted(() => vi.fn());
const mockRevokeLeave = vi.hoisted(() => vi.fn());
const mockRestoreLeave = vi.hoisted(() => vi.fn());
const mockEditLeave = vi.hoisted(() => vi.fn());

vi.mock("../../api/admin", () => ({
  fetchAdminDailyOverrideCalendar: mockFetchCalendar,
  saveAdminDailyOverride: mockSave,
  clearAdminDailyOverride: mockClear,
  saveAdminDailyOverrideBatch: mockSaveBatch,
  revokeLeaveRecord: mockRevokeLeave,
  restoreLeaveRecord: mockRestoreLeave,
  editLeaveRecord: mockEditLeave,
}));

import AttendanceOverrideCalendarModal from "./AttendanceOverrideCalendarModal";
import { NotificationProvider } from "../feedback/Notification";
import type { AttendanceCalendarData } from "../../types/query";

const EMPLOYEE = { id: 7, emp_no: "E001", name: "员工甲" };

function calendarData(
  overrides: Record<string, unknown> = {},
  leaves: AttendanceCalendarData["leaves"] = [],
): AttendanceCalendarData {
  return {
    employee: { ...EMPLOYEE, dept_name: "制造一部" },
    month: "2026-07",
    days: [
      {
        date: "2026-07-01",
        check_in_times: ["08:00"],
        check_out_times: ["17:00"],
        punch_count: 2,
        actual_hours: 8,
        late_minutes: 0,
        early_leave_minutes: 0,
        is_half_day: false,
        actual_attendance_days: 1,
        exception_reason: "",
        override: (overrides["2026-07-01"] as never) ?? null,
      },
      {
        date: "2026-07-15",
        check_in_times: [],
        check_out_times: [],
        punch_count: 0,
        actual_hours: 0,
        late_minutes: 0,
        early_leave_minutes: 0,
        is_half_day: false,
        actual_attendance_days: 0,
        exception_reason: "",
        override: (overrides["2026-07-15"] as never) ?? null,
      },
    ],
    overtimes: [],
    leaves,
    summary: {
      attendance_days: 1,
      half_days: 0,
      leave_by_type: [],
      evening_overtime_hours: 0,
      other_overtime_hours: 0,
      late_minutes_total: 0,
      early_leave_minutes_total: 0,
    },
  };
}

function renderModal(props: Partial<Parameters<typeof AttendanceOverrideCalendarModal>[0]> = {}) {
  return render(
    <NotificationProvider>
      <AttendanceOverrideCalendarModal
        editTitle="编辑员工考勤修正"
        employee={EMPLOYEE}
        hasMonthlyOverride={false}
        isLocked={false}
        isManager={false}
        month="2026-07"
        onClose={vi.fn()}
        onRowRefresh={vi.fn()}
        {...props}
      />
    </NotificationProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AttendanceOverrideCalendarModal", () => {
  beforeEach(() => {
    mockFetchCalendar.mockResolvedValue(calendarData());
  });

  it("加载数据时保持最终弹窗的日历与编辑面板双栏结构", () => {
    mockFetchCalendar.mockReturnValue(new Promise(() => {}));
    renderModal();

    const dialog = screen.getByRole("dialog", { name: "编辑员工考勤修正" });
    expect(dialog.querySelector(".attendance-override-calendar-layout")).toBeInTheDocument();
    expect(dialog.querySelector(".attendance-override-calendar-main .attendance-calendar-grid")).toBeInTheDocument();
    expect(dialog.querySelector(".attendance-override-calendar-side .attendance-override-daypanel")).toBeInTheDocument();
  });

  it("打开时拉取日历数据并渲染汇总条", async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText(/出勤 1 天/)).toBeInTheDocument();
    });
    expect(mockFetchCalendar).toHaveBeenCalledWith(EMPLOYEE.id, "2026-07");
  });

  it("点选日期显示当天面板与原始明细", async () => {
    mockSave.mockResolvedValue({ calendar: calendarData(), row: {} });
    renderModal();
    await screen.findByText(/出勤 1 天/);
    fireEvent.click(screen.getByRole("button", { name: "2026-07-01" }));
    const panel = screen.getByTestId("daily-override-panel");
    expect(within(panel).getByText("2026-07-01")).toBeInTheDocument();
    expect(within(panel).getByText("周三")).toBeInTheDocument(); // 2026-07-01 是周三
    expect(screen.getByText("上班卡")).toBeInTheDocument();
    expect(screen.getByText("08:00")).toBeInTheDocument();
  });

  it("首次点击仅选中不切换，再次点击同一格才循环切换", async () => {
    mockSave.mockImplementation(async (payload: { status?: string }) => {
      const status = payload.status ?? "";
      return { calendar: calendarData(status ? { "2026-07-15": { status } } : {}), row: {} };
    });
    renderModal();

    await screen.findByText(/出勤 1 天/);
    const cell = screen.getByRole("button", { name: "2026-07-15" });

    fireEvent.click(cell); // 第一次：仅选中展示
    expect(screen.getByText("当前：跟随系统")).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();

    fireEvent.click(cell); // 第二次：切到全勤（乐观立即显示）
    expect(screen.getByText("当前：全勤")).toBeInTheDocument();
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-07-15", status: "全勤" }));
    });

    fireEvent.click(cell); // 第三次：上午出勤
    expect(screen.getByText("当前：上午出勤")).toBeInTheDocument();
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledTimes(2);
    });
    expect(mockSave.mock.calls[1][0]).toMatchObject({ date: "2026-07-15", status: "上午出勤" });
  });

  it("单选后点击另一格自动进入多选，右侧切换为批量面板", async () => {
    mockSave.mockResolvedValue({ calendar: calendarData(), row: {} });
    renderModal();

    await screen.findByText(/出勤 1 天/);
    const cellA = screen.getByRole("button", { name: "2026-07-15" });
    const cellB = screen.getByRole("button", { name: "2026-07-01" });

    fireEvent.click(cellA); // 选中 A：单选模式
    expect(screen.getByTestId("daily-override-panel")).toBeInTheDocument();

    fireEvent.click(cellB); // 点击不同格：自动进入多选
    expect(cellA).toHaveClass("is-multi-selected");
    expect(cellB).toHaveClass("is-multi-selected");
    expect(screen.getByTestId("daily-override-batch-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("daily-override-panel")).toBeNull();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("快速连点格子只保存最终状态（防抖合并）", async () => {
    mockSave.mockResolvedValue({ calendar: calendarData({ "2026-07-15": { status: "上午出勤" } }), row: {} });
    renderModal();

    await screen.findByText(/出勤 1 天/);
    const cell = screen.getByRole("button", { name: "2026-07-15" });
    fireEvent.click(cell); // 选中
    fireEvent.click(cell); // 乐观：→ 全勤
    fireEvent.click(cell); // 乐观：→ 上午出勤

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledTimes(1);
    });
    expect(mockSave.mock.calls[0][0]).toMatchObject({ status: "上午出勤" });
  }, 5000);

  it("缺勤的格子再次点击直接切到全勤（不再经过跟随系统）", async () => {
    mockFetchCalendar.mockResolvedValue(calendarData({ "2026-07-15": { status: "缺勤" } }));
    mockSave.mockResolvedValue({ calendar: calendarData({ "2026-07-15": { status: "全勤" } }), row: {} });
    renderModal();

    await screen.findByText(/出勤 1 天/);
    const cell = screen.getByRole("button", { name: "2026-07-15" });
    fireEvent.click(cell); // 选中
    expect(screen.getByText("当前：缺勤")).toBeInTheDocument();
    fireEvent.click(cell); // 切换 → 全勤
    expect(screen.getByText("当前：全勤")).toBeInTheDocument();
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-07-15", status: "全勤" }));
    });
  });

  it("点击格子切换时保留该日其他修正字段（晚加/工时/备注）", async () => {
    mockFetchCalendar.mockResolvedValue(
      calendarData({ "2026-07-15": { status: "全勤", is_evening_overtime: true, work_hours: 6, remark: "补卡" } }),
    );
    mockSave.mockResolvedValue({ calendar: calendarData({ "2026-07-15": { status: "上午出勤" } }), row: {} });
    renderModal();

    await screen.findByText(/出勤 1 天/);
    const cell = screen.getByRole("button", { name: "2026-07-15" });
    fireEvent.click(cell); // 选中
    fireEvent.click(cell); // 切换
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          date: "2026-07-15",
          status: "上午出勤",
          is_evening_overtime: true,
          work_hours: 6,
          remark: "补卡",
        }),
      );
    });
  });

  it("点击状态按钮立即保存并回传新行", async () => {
    const onRowRefresh = vi.fn();
    const row = { employee: EMPLOYEE };
    mockSave.mockResolvedValue({ calendar: calendarData(), row });
    renderModal({ onRowRefresh });

    await screen.findByText(/出勤 1 天/);
    fireEvent.click(screen.getByRole("button", { name: "2026-07-15" })); // 首次点击仅选中
    expect(mockSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "标记 事假" }));

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({ month: "2026-07", emp_id: EMPLOYEE.id, date: "2026-07-15", status: "事假" }),
      );
    });
    expect(onRowRefresh).toHaveBeenCalledWith(row);
  });

  it("更多信息默认展开，可直接编辑工时/晚加并保存", async () => {
    mockSave.mockResolvedValue({ calendar: calendarData(), row: {} });
    renderModal();

    await screen.findByText(/出勤 1 天/);
    fireEvent.click(screen.getByRole("button", { name: "2026-07-01" })); // 首次点击仅选中
    expect(screen.getByLabelText("工时（小时）")).toBeVisible(); // 无需点开，默认展开

    fireEvent.change(screen.getByLabelText("工时（小时）"), { target: { value: "8" } });
    fireEvent.click(within(screen.getByRole("group", { name: "单日晚上加班" })).getByText("算"));
    fireEvent.click(screen.getByRole("button", { name: "保存修正" }));

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          date: "2026-07-01",
          work_hours: "8",
          is_evening_overtime: true,
        }),
      );
    });
  });

  it("已有假种修正的日期显示当前状态、修正人与清除按钮", async () => {
    const existing = { status: "事假", remark: "补卡", updated_by_name: "admin", updated_at: "2026-08-01T10:00:00" };
    mockFetchCalendar.mockResolvedValue(calendarData({ "2026-07-15": existing }));
    // 点击格子会触发循环切换保存，mock 返回保持原状的数据避免状态漂移
    mockSave.mockResolvedValue({ calendar: calendarData({ "2026-07-15": existing }), row: {} });
    mockClear.mockResolvedValue({ calendar: calendarData(), row: {} });
    renderModal();

    await screen.findByText(/出勤 1 天/);
    fireEvent.click(screen.getByRole("button", { name: "2026-07-15" }));
    const panel = await screen.findByTestId("daily-override-panel");
    await waitFor(() => {
      expect(within(panel).getByText("当前：事假")).toBeInTheDocument();
    });
    expect(within(panel).getByRole("button", { name: "标记 事假" })).toHaveClass("is-active");
    expect(within(panel).getByText(/admin/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "清除修正" }));

    await waitFor(() => {
      expect(mockClear).toHaveBeenCalledWith(EMPLOYEE.id, "2026-07-15");
    });
  });

  it("面板不显示可循环切换的出勤状态按钮，仅显示假种", async () => {
    mockSave.mockResolvedValue({ calendar: calendarData(), row: {} });
    renderModal();
    await screen.findByText(/出勤 1 天/);
    const cell = screen.getByRole("button", { name: "2026-07-01" });
    fireEvent.click(cell); // 首次点击仅选中
    for (const status of ["全勤", "上午出勤", "下午出勤", "缺勤"]) {
      expect(screen.queryByRole("button", { name: `标记 ${status}` })).toBeNull();
    }
    expect(screen.getByRole("button", { name: "标记 事假" })).toBeInTheDocument();
    expect(screen.getByText("当前：跟随系统")).toBeInTheDocument();
    fireEvent.click(cell); // 再次点击切换（乐观立即显示）
    expect(screen.getByText("当前：全勤")).toBeInTheDocument();
  });

  it("账套锁定时禁用全部编辑控件，点击格子只选中不保存", async () => {
    renderModal({ isLocked: true });
    await screen.findByText(/出勤 1 天/);
    expect(screen.getByText(/账套已锁定/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2026-07-01" }));
    expect(screen.getByTestId("daily-override-panel")).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "标记 事假" })).toBeDisabled();
  });

  it("存在月度修正时提示最终应用以月度修正为准", async () => {
    renderModal({ hasMonthlyOverride: true });
    await screen.findByText(/出勤 1 天/);
    expect(screen.getByText(/最终应用值以月度修正为准/)).toBeInTheDocument();
  });

  it("管理人员使用管理人员状态枚举", async () => {
    mockSave.mockResolvedValue({ calendar: calendarData(), row: {} });
    renderModal({ isManager: true });
    await screen.findByText(/出勤 1 天/);
    fireEvent.click(screen.getByRole("button", { name: "2026-07-01" }));
    expect(screen.getByRole("button", { name: "标记 出差" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "标记 事假" })).toBeNull();
  });

  it("单日实际打卡三选：算传 true、不算传 false、不动保持原值不覆盖", async () => {
    mockSave.mockResolvedValue({ calendar: calendarData(), row: {} });
    renderModal();

    await screen.findByText(/出勤 1 天/);
    fireEvent.click(screen.getByRole("button", { name: "2026-07-01" }));
    const actualGroup = screen.getByRole("group", { name: "单日实际打卡" });

    // 选「算」保存 → true
    fireEvent.click(within(actualGroup).getByText("算"));
    fireEvent.click(screen.getByRole("button", { name: "保存修正" }));
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-07-01", is_actual_attendance: true }));
    });

    // 选「不算」保存 → false；此后日历带「算」修正返回，面板 currentOverride=true
    mockSave.mockResolvedValue({ calendar: calendarData({ "2026-07-01": { is_actual_attendance: true } }), row: {} });
    mockSave.mockClear();
    fireEvent.click(within(actualGroup).getByText("不算"));
    fireEvent.click(screen.getByRole("button", { name: "保存修正" }));
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-07-01", is_actual_attendance: false }));
    });

    // 已修正 true 的天选「不动」保存 → 保持 true（不被未勾选状态覆盖成 false/null）
    mockSave.mockClear();
    fireEvent.click(within(actualGroup).getByText("不动"));
    fireEvent.click(screen.getByRole("button", { name: "保存修正" }));
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-07-01", is_actual_attendance: true }));
    });
  });

  it("多选中点击格子继续勾选/取消，取消到剩一个自动回单选", async () => {
    renderModal();

    await screen.findByText(/出勤 1 天/);
    const cellA = screen.getByRole("button", { name: "2026-07-01" });
    const cellB = screen.getByRole("button", { name: "2026-07-15" });
    const cellC = screen.getByRole("button", { name: "2026-07-02" });

    fireEvent.click(cellA); // 单选 A
    fireEvent.click(cellB); // 进入多选 [A, B]
    expect(screen.getByText(/已选 2 天/)).toBeInTheDocument();

    fireEvent.click(cellC); // 继续加选
    expect(screen.getByText(/已选 3 天/)).toBeInTheDocument();

    fireEvent.click(cellC); // 取消 C，剩 2 个仍为多选
    expect(screen.getByText(/已选 2 天/)).toBeInTheDocument();

    fireEvent.click(cellA); // 取消到剩 1 个 → 自动回单选 B
    expect(cellA).not.toHaveClass("is-multi-selected");
    expect(cellB).not.toHaveClass("is-multi-selected");
    expect(cellB).toHaveClass("is-selected");
    expect(screen.queryByTestId("daily-override-batch-panel")).toBeNull();
    const panel = screen.getByTestId("daily-override-panel");
    expect(within(panel).getByText("2026-07-15")).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockSaveBatch).not.toHaveBeenCalled();
  });

  it("多选批量设置面板：同时应用状态与实际打卡并刷新", async () => {
    const onRowRefresh = vi.fn();
    const row = { employee: EMPLOYEE };
    mockSaveBatch.mockResolvedValue({
      calendar: calendarData({
        "2026-07-01": { status: "病假", is_actual_attendance: true },
        "2026-07-15": { status: "病假", is_actual_attendance: true },
      }),
      row,
    });
    renderModal({ onRowRefresh });

    await screen.findByText(/出勤 1 天/);
    fireEvent.click(screen.getByRole("button", { name: "2026-07-01" }));
    fireEvent.click(screen.getByRole("button", { name: "2026-07-15" })); // 点击第二格自动进入多选
    fireEvent.change(screen.getByLabelText("批量考勤状态"), { target: { value: "病假" } });
    fireEvent.click(screen.getByLabelText("算"));
    fireEvent.click(screen.getByRole("button", { name: "批量应用" }));

    await waitFor(() => {
      expect(mockSaveBatch).toHaveBeenCalledWith({
        month: "2026-07",
        emp_id: EMPLOYEE.id,
        dates: ["2026-07-01", "2026-07-15"],
        status: "病假",
        is_actual_attendance: true,
      });
    });
    expect(onRowRefresh).toHaveBeenCalledWith(row);
    // 成功后清空勾选，回到无选中的骨架占位
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "2026-07-01" })).not.toHaveClass("is-multi-selected");
    });
    expect(screen.queryByTestId("daily-override-batch-panel")).toBeNull();
    expect(screen.queryByTestId("daily-override-panel")).toBeNull();
    // 批量勾「算实际打卡」跟随默认口径，格子无专门标记，以修正角点体现
    expect(screen.getAllByTitle("手工修正")).toHaveLength(2);
  });

  it("多选批量只选状态时 payload 不含实际打卡", async () => {
    mockSaveBatch.mockResolvedValue({ calendar: calendarData(), row: {} });
    renderModal();

    await screen.findByText(/出勤 1 天/);
    fireEvent.click(screen.getByRole("button", { name: "2026-07-15" }));
    fireEvent.click(screen.getByRole("button", { name: "2026-07-01" })); // 进入多选
    fireEvent.change(screen.getByLabelText("批量考勤状态"), { target: { value: "事假" } });
    fireEvent.click(screen.getByRole("button", { name: "批量应用" }));

    await waitFor(() => {
      expect(mockSaveBatch).toHaveBeenCalledWith({
        month: "2026-07",
        emp_id: EMPLOYEE.id,
        dates: ["2026-07-15", "2026-07-01"],
        status: "事假",
      });
    });
  });

  it("多选批量选「跟随系统」传空串清除状态", async () => {
    mockSaveBatch.mockResolvedValue({ calendar: calendarData(), row: {} });
    renderModal();

    await screen.findByText(/出勤 1 天/);
    fireEvent.click(screen.getByRole("button", { name: "2026-07-15" }));
    fireEvent.click(screen.getByRole("button", { name: "2026-07-01" })); // 进入多选
    fireEvent.change(screen.getByLabelText("批量考勤状态"), { target: { value: "__clear__" } });
    fireEvent.click(screen.getByRole("button", { name: "批量应用" }));

    await waitFor(() => {
      expect(mockSaveBatch).toHaveBeenCalledWith(
        expect.objectContaining({ dates: ["2026-07-15", "2026-07-01"], status: "" }),
      );
    });
  });

  it("多选批量只选实际打卡「不算」传 false", async () => {
    mockSaveBatch.mockResolvedValue({ calendar: calendarData(), row: {} });
    renderModal();

    await screen.findByText(/出勤 1 天/);
    fireEvent.click(screen.getByRole("button", { name: "2026-07-15" }));
    fireEvent.click(screen.getByRole("button", { name: "2026-07-01" })); // 进入多选
    fireEvent.click(screen.getByLabelText("不算"));
    fireEvent.click(screen.getByRole("button", { name: "批量应用" }));

    await waitFor(() => {
      expect(mockSaveBatch).toHaveBeenCalledWith(
        expect.objectContaining({ dates: ["2026-07-15", "2026-07-01"], is_actual_attendance: false }),
      );
    });
  });

  it("多选批量状态与实际打卡都选不动时应用按钮禁用", async () => {
    renderModal();

    await screen.findByText(/出勤 1 天/);
    fireEvent.click(screen.getByRole("button", { name: "2026-07-15" }));
    fireEvent.click(screen.getByRole("button", { name: "2026-07-01" })); // 进入多选
    expect(screen.getByRole("button", { name: "批量应用" })).toBeDisabled();
    expect(mockSaveBatch).not.toHaveBeenCalled();
  });

  it("多选批量面板按人员类型显示状态选项", async () => {
    mockSaveBatch.mockResolvedValue({ calendar: calendarData(), row: {} });
    renderModal({ isManager: true });

    await screen.findByText(/出勤 1 天/);
    fireEvent.click(screen.getByRole("button", { name: "2026-07-15" }));
    fireEvent.click(screen.getByRole("button", { name: "2026-07-01" })); // 进入多选
    const select = screen.getByLabelText("批量考勤状态") as HTMLSelectElement;
    const options = Array.from(select.options).map((option) => option.value);
    expect(options).toContain("出差");
    expect(options).not.toContain("事假");
  });

  it("多选中点「取消全选」清空勾选并恢复单选交互", async () => {
    renderModal();

    await screen.findByText(/出勤 1 天/);
    const cell = screen.getByRole("button", { name: "2026-07-15" });
    fireEvent.click(screen.getByRole("button", { name: "2026-07-01" })); // 单选
    fireEvent.click(cell); // 进入多选
    expect(cell).toHaveClass("is-multi-selected");

    fireEvent.click(screen.getByRole("button", { name: "取消全选" }));
    expect(cell).not.toHaveClass("is-multi-selected");
    expect(screen.queryByTestId("daily-override-batch-panel")).toBeNull();

    fireEvent.click(cell); // 恢复单选：首次点击仅选中
    expect(screen.getByTestId("daily-override-panel")).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("账套锁定时点击不同格子不进入多选，保持单选查看", async () => {
    renderModal({ isLocked: true });
    await screen.findByText(/出勤 1 天/);
    fireEvent.click(screen.getByRole("button", { name: "2026-07-01" }));
    const panel = screen.getByTestId("daily-override-panel");
    expect(within(panel).getByText("2026-07-01")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "2026-07-15" })); // 锁定时仅切换查看
    expect(screen.queryByTestId("daily-override-batch-panel")).toBeNull();
    const nextPanel = screen.getByTestId("daily-override-panel");
    expect(within(nextPanel).getByText("2026-07-15")).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------- 请假单区块

  const LEAVE_ENTRY = {
    date: "2026-07-15",
    leave_type: "事假",
    duration: 0.5,
    leave_no: "QY2026071501",
    start_time: "2026-07-15 13:00",
    end_time: "2026-07-15 17:00",
    reason: "家里有事",
    approval_status: "已审批",
    id: 3,
    is_revoked: false,
  };

  function revokedCalendar(): AttendanceCalendarData {
    return calendarData({}, [{ ...LEAVE_ENTRY, is_revoked: true }]);
  }

  it("单日面板展示当日请假单，作废后置灰并以响应日历刷新", async () => {
    mockFetchCalendar.mockResolvedValue(calendarData({}, [LEAVE_ENTRY]));
    mockRevokeLeave.mockResolvedValue({ leave: { ...LEAVE_ENTRY, is_revoked: true }, calendar: revokedCalendar() });
    renderModal();
    await screen.findByText(/出勤 1 天/);
    fireEvent.click(screen.getByRole("button", { name: "2026-07-15" }));

    const panel = screen.getByTestId("daily-override-panel");
    expect(within(panel).getByTestId("daypanel-leave-type")).toHaveTextContent("事假");
    expect(within(panel).getByText(/QY2026071501/)).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "作废" }));
    await waitFor(() => expect(mockRevokeLeave).toHaveBeenCalledWith(3, "2026-07"));
    await screen.findByText("已撤销");
    expect(within(panel).getByRole("button", { name: "恢复" })).toBeInTheDocument();
  });

  it("已作废请假单点恢复，调用恢复接口并刷新", async () => {
    mockFetchCalendar.mockResolvedValue(revokedCalendar());
    mockRestoreLeave.mockResolvedValue({ leave: LEAVE_ENTRY, calendar: calendarData({}, [LEAVE_ENTRY]) });
    renderModal();
    await screen.findByText(/出勤 1 天/);
    fireEvent.click(screen.getByRole("button", { name: "2026-07-15" }));

    const panel = screen.getByTestId("daily-override-panel");
    expect(screen.getByText("已撤销")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "恢复" }));
    await waitFor(() => expect(mockRestoreLeave).toHaveBeenCalledWith(3, "2026-07"));
    await waitFor(() => expect(screen.queryByText("已撤销")).toBeNull());
    expect(within(panel).getByRole("button", { name: "作废" })).toBeInTheDocument();
  });

  it("编辑请假单提交时段与假种", async () => {
    mockFetchCalendar.mockResolvedValue(calendarData({}, [LEAVE_ENTRY]));
    mockEditLeave.mockResolvedValue({
      leave: { ...LEAVE_ENTRY, leave_type: "补休（调休）", is_manual_edited: true },
      calendar: calendarData({}, [{ ...LEAVE_ENTRY, leave_type: "补休（调休）" }]),
    });
    renderModal();
    await screen.findByText(/出勤 1 天/);
    fireEvent.click(screen.getByRole("button", { name: "2026-07-15" }));

    const panel = screen.getByTestId("daily-override-panel");
    fireEvent.click(within(panel).getByRole("button", { name: "编辑" }));
    fireEvent.change(within(panel).getByLabelText("假种"), { target: { value: "补休（调休）" } });
    fireEvent.click(within(panel).getByRole("button", { name: "保存请假单" }));

    await waitFor(() =>
      expect(mockEditLeave).toHaveBeenCalledWith(3, {
        month: "2026-07",
        start_time: "2026-07-15 13:00",
        end_time: "2026-07-15 17:00",
        leave_type: "补休（调休）",
      }),
    );
  });

  it("账套锁定时请假单操作按钮禁用", async () => {
    mockFetchCalendar.mockResolvedValue(calendarData({}, [LEAVE_ENTRY]));
    renderModal({ isLocked: true });
    await screen.findByText(/出勤 1 天/);
    fireEvent.click(screen.getByRole("button", { name: "2026-07-15" }));

    const panel = screen.getByTestId("daily-override-panel");
    expect(within(panel).getByRole("button", { name: "作废" })).toBeDisabled();
    expect(within(panel).getByRole("button", { name: "编辑" })).toBeDisabled();
  });
});
