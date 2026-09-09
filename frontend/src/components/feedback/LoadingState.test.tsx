import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import LoadingState from "./LoadingState";

afterEach(() => cleanup());

describe("LoadingState", () => {
  it("用动效替代可见准备文案，同时保留无障碍状态提示", () => {
    render(<LoadingState message="正在准备查询页..." />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status.querySelector(".legacy-loading-visual")).toBeInTheDocument();
    expect(screen.getByText("正在准备查询页...")).toHaveClass("legacy-loading-announcement");
  });
});
