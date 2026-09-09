import { cleanup, render, screen } from "@testing-library/react";
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
});
