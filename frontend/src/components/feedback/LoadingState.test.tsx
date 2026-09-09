import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import LoadingState from "./LoadingState";

afterEach(() => cleanup());

describe("LoadingState", () => {
  it("移除加载图形，同时保留无障碍状态提示和文案", () => {
    render(<LoadingState message="正在准备查询页..." variant="table" />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status.querySelector(".legacy-loading-visual")).not.toBeInTheDocument();
    expect(status.querySelector(".legacy-loading-skeleton--table")).toBeInTheDocument();
    expect(status.querySelector(".legacy-loading-skeleton-table")).toBeInTheDocument();
    expect(screen.getByText("正在准备查询页...")).toHaveClass("legacy-loading-announcement");
  });

  it("按首页类型渲染与月报结构对应的占位内容", () => {
    render(<LoadingState variant="home" />);

    expect(screen.getByRole("status").querySelector(".legacy-loading-skeleton--home")).toBeInTheDocument();
    expect(screen.getByRole("status").querySelector(".legacy-loading-skeleton-kpis")).toBeInTheDocument();
  });

  it("查询页加载态保留左侧筛选栏和右侧结果区", () => {
    render(<LoadingState filterFields={3} headers={["姓名", "部门", "考勤天数"]} variant="query-page" />);

    const status = screen.getByRole("status");
    expect(status).toHaveClass("query-page-shell");
    expect(status.querySelector(".query-filter-rail")).toBeInTheDocument();
    expect(status.querySelectorAll(".query-filter-field")).toHaveLength(3);
    expect(status.querySelector(".query-workspace .legacy-table")).toBeInTheDocument();
    expect(within(status).getByText("考勤天数")).toBeInTheDocument();
  });

  it("账套中心加载态保留顶部控制区、摘要条和记录表格", () => {
    render(<LoadingState headers={["文件名", "导入时间", "状态"]} variant="account-center" />);

    const status = screen.getByRole("status");
    expect(status).toHaveClass("account-center-page");
    expect(status.querySelector(".account-top-control-row")).toBeInTheDocument();
    expect(status.querySelector(".active-account-set-summary-bar")).toBeInTheDocument();
    expect(status.querySelector(".account-workflow .legacy-table")).toBeInTheDocument();
  });

  it("简单后台列表加载态只保留列表标题、操作区和表格", () => {
    render(<LoadingState headers={["用户名", "姓名", "操作"]} variant="account-list" />);

    const status = screen.getByRole("status");
    expect(status).toHaveClass("account-center-page");
    expect(status.querySelector(".master-list-header")).toBeInTheDocument();
    expect(status.querySelector(".master-filter-panel")).not.toBeInTheDocument();
    expect(status.querySelector(".legacy-table")).toBeInTheDocument();
  });

  it("汇总下载加载态使用与真实页面相同的步骤卡片", () => {
    render(<LoadingState variant="summary-download" />);

    const status = screen.getByRole("status");
    expect(status).toHaveClass("summary-download-container");
    expect(status.querySelectorAll(".step-card")).toHaveLength(3);
  });

  it("数据库解锁加载态保持居中的安全解锁卡片", () => {
    render(<LoadingState variant="database-unlock" />);

    const status = screen.getByRole("status");
    expect(status).toHaveClass("database-unlock-loading");
    expect(status.querySelector(".loading-database-unlock-card")).toBeInTheDocument();
    expect(status.querySelectorAll(".skeleton-input")).toHaveLength(1);
  });

  it("考勤修正弹窗加载态同时保留日历和右侧编辑面板", () => {
    render(<LoadingState variant="attendance-override-modal" />);

    const status = screen.getByRole("status");
    expect(status.querySelector(".attendance-override-calendar-layout")).toBeInTheDocument();
    expect(status.querySelector(".attendance-override-calendar-main .attendance-calendar-grid")).toBeInTheDocument();
    expect(status.querySelector(".attendance-override-calendar-side .attendance-override-daypanel")).toBeInTheDocument();
  });
});
