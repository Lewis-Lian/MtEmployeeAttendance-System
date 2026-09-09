import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@number-flow/react", () => ({
  default: ({ value, transformTiming }: { value: number; transformTiming?: { duration?: number } }) => (
    <span data-number-flow data-duration={transformTiming?.duration}>{value}</span>
  ),
}));

import KpiNumber from "./KpiNumber";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("KpiNumber", () => {
  it("首次渲染从 0 开始，再切换到目标数字", () => {
    vi.useFakeTimers();

    render(<KpiNumber testId="kpi" value={20} />);

    expect(screen.getByTestId("kpi")).toHaveTextContent("0");

    act(() => {
      vi.runAllTimers();
    });

    expect(screen.getByTestId("kpi")).toHaveTextContent("20");
  });

  it("使用较慢的数字过渡时长", () => {
    render(<KpiNumber testId="kpi" value={20} />);

    expect(screen.getByTestId("kpi").querySelector("[data-number-flow]")).toHaveAttribute(
      "data-duration",
      "1200",
    );
  });
});
