import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";

const mockBootstrap = vi.hoisted(() => vi.fn());
const mockFetchMe = vi.hoisted(() => vi.fn());
const mockHomeSummary = vi.hoisted(() => vi.fn());
const mockCalendar = vi.hoisted(() => vi.fn());

vi.mock("../../api/query", () => ({
  fetchQueryBootstrap: mockBootstrap,
  fetchHomeSummary: mockHomeSummary,
  fetchAttendanceCalendar: mockCalendar,
}));
vi.mock("../../api/auth", () => ({
  fetchMe: mockFetchMe,
}));

import QueryHomePage from "./QueryHomePage";

const calendarPayload = {
  employee: { id: 7, emp_no: "100701010", name: "余兆中", dept_name: "制造一部" },
  month: "2026-05",
  days: [],
  overtimes: [],
  leaves: [],
  summary: {
    attendance_days: 0,
    half_days: 0,
    leave_by_type: [],
    evening_overtime_hours: 0,
    other_overtime_hours: 0,
    late_minutes_total: 0,
    early_leave_minutes_total: 0,
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("QueryHomePage 纯首页权限用户", () => {
  beforeEach(() => {
    mockFetchMe.mockResolvedValue({ username: "100701010", role: "readonly" });
    // 纯首页权限用户也能拿到账套（首页摘要依赖它定位数据），但 departments 为空
    mockBootstrap.mockResolvedValue({
      employees: [],
      account_sets: [
        { id: 1, month: "2026-05", name: "2026年5月", is_active: true },
      ],
      departments: [],
    });
    mockHomeSummary.mockResolvedValue({
      has_data: true,
      month: "2026-05",
      account_set_name: "2026年5月",
      support_message: "已加载首页摘要",
      manager: { emp_no: "100701010", name: "余兆中", dept_name: "制造一部" },
      summary: { attendance_days: 20 },
    });
    mockCalendar.mockResolvedValue(calendarPayload);
  });

  it("能拿到账套并加载出绑定的管理人员摘要", async () => {
    render(<QueryHomePage />);

    // 应调用 home-summary（month 来自账套）并显示真实摘要，而非卡在 loading
    await waitFor(
      () => {
        expect(mockHomeSummary).toHaveBeenCalledWith("2026-05");
      },
      { timeout: 2000 },
    );

    // 不应停留在加载文案
    await waitFor(() => {
      expect(screen.queryByText("正在加载首页摘要...")).toBeNull();
    });

    // KPI 数字经 number-flow 渲染出摘要值（mock 中 attendance_days: 20）
    await waitFor(() => {
      expect(screen.getByTestId("kpi-attendance").textContent).toContain("20");
    });
  });

  it("后端未返回管理人员 emp_id 时不出考勤日历面板", async () => {
    render(<QueryHomePage />);

    await waitFor(() => {
      expect(screen.queryByText("正在加载首页摘要...")).toBeNull();
    });

    expect(mockCalendar).not.toHaveBeenCalled();
    expect(screen.queryByText("考勤日历")).toBeNull();
  });

  it("首页 KPI 卡片按顺序设置错峰入场延迟", async () => {
    render(<QueryHomePage />);

    await waitFor(() => {
      expect(screen.getByTestId("kpi-attendance")).toBeInTheDocument();
    });

    const cards = Array.from(document.querySelectorAll(".qh-kpi-card-hero"));
    expect(cards).toHaveLength(4);
    expect(cards.map((card) => card.getAttribute("style"))).toEqual([
      "--qh-kpi-index: 0;",
      "--qh-kpi-index: 1;",
      "--qh-kpi-index: 2;",
      "--qh-kpi-index: 3;",
    ]);
  });

  it("使用极简数据产品首页结构", async () => {
    render(<QueryHomePage />);

    await waitFor(() => {
      expect(screen.getByTestId("kpi-attendance")).toBeInTheDocument();
    });

    expect(document.querySelector(".qh-minimal-shell")).not.toBeNull();
    expect(screen.getByText("今日概览")).toBeInTheDocument();
    expect(screen.getByText("本月请假构成")).toBeInTheDocument();
  });

  it("将账套选择放在独立筛选栏且不显示用户角色", async () => {
    render(<QueryHomePage />);

    await waitFor(() => {
      expect(screen.getByTestId("kpi-attendance")).toBeInTheDocument();
    });

    expect(document.querySelector(".qh-minimal-filterbar")).not.toBeNull();
    expect(screen.getByText("账套选择")).toBeInTheDocument();
    expect(screen.queryByText("管理员")).toBeNull();
    expect(screen.queryByText("只读用户")).toBeNull();
  });
});

describe("QueryHomePage 首页考勤日历", () => {
  beforeEach(() => {
    mockFetchMe.mockResolvedValue({ username: "100701010", role: "readonly" });
    // 纯首页权限用户的 bootstrap 可见员工列表为空，日历员工 id 只能来自 home-summary
    mockBootstrap.mockResolvedValue({
      employees: [],
      account_sets: [
        { id: 1, month: "2026-05", name: "2026年5月", is_active: true },
      ],
      departments: [],
    });
    mockHomeSummary.mockResolvedValue({
      has_data: true,
      month: "2026-05",
      account_set_name: "2026年5月",
      support_message: "已加载首页摘要",
      manager: { emp_id: 7, emp_no: "100701010", name: "余兆中", dept_name: "制造一部" },
      summary: { attendance_days: 20 },
    });
  });

  it("按绑定管理人员与账套月份加载日历，且位于请假与外勤类型占比上方", async () => {
    mockCalendar.mockResolvedValue(calendarPayload);
    render(<QueryHomePage />);

    await waitFor(() => {
      expect(mockCalendar).toHaveBeenCalledWith(7, "2026-05");
    });
    await waitFor(() => {
      expect(screen.getByText("周一")).toBeInTheDocument();
    });

    const calendarTitle = screen.getByText("考勤日历");
    const ratioTitle = screen.getByText("请假与外勤类型占比");
    expect(
      calendarTitle.compareDocumentPosition(ratioTitle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // 日历面板使用首页极简布局的主内容面板
    expect(calendarTitle.closest(".qh-minimal-calendar-panel")).not.toBeNull();
  });

  it("日历接口失败时在面板内提示错误，不影响首页摘要", async () => {
    mockCalendar.mockRejectedValue(new ApiError("服务器错误", 500, null));
    render(<QueryHomePage />);

    await waitFor(() => {
      expect(screen.getByText("服务器错误")).toBeInTheDocument();
    });
    expect(screen.getByText("请假与外勤类型占比")).toBeInTheDocument();
  });

  it("日历接口返回 403 时隐藏面板（无日历权限用户）", async () => {
    mockCalendar.mockRejectedValue(new ApiError("无权限访问", 403, null));
    render(<QueryHomePage />);

    await waitFor(() => {
      expect(mockCalendar).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "考勤日历" })).toBeNull();
    });
    expect(screen.getByText("请假与外勤类型占比")).toBeInTheDocument();
  });

  it("日历接口返回 400（绑定管理人员超出可见范围）时隐藏面板", async () => {
    mockCalendar.mockRejectedValue(new ApiError("无效的员工范围", 400, null));
    render(<QueryHomePage />);

    await waitFor(() => {
      expect(mockCalendar).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "考勤日历" })).toBeNull();
      expect(screen.queryByText("无效的员工范围")).toBeNull();
    });
    expect(screen.getByText("请假与外勤类型占比")).toBeInTheDocument();
  });
});
