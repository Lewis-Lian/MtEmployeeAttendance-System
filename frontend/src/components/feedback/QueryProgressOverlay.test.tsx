import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import QueryProgressOverlay from "./QueryProgressOverlay";

describe("QueryProgressOverlay", () => {
  it("shows progress, status text, and milestone markers while active", () => {
    render(<QueryProgressOverlay active progress={64} text="正在整理考勤数据..." />);

    expect(screen.getByRole("status")).toHaveClass("is-active");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "64");
    expect(screen.getByText("64%")).toBeInTheDocument();
    expect(screen.getByText("正在整理考勤数据...")).toBeInTheDocument();
    expect(screen.getByRole("progressbar").querySelectorAll(".query-progress-milestone")).toHaveLength(4);
  });

  it("keeps the overlay hidden when inactive", () => {
    render(<QueryProgressOverlay active={false} progress={0} text="等待中" />);

    expect(screen.getByRole("status")).not.toHaveClass("is-active");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });
});
