import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AccountSetSelector from "./AccountSetSelector";

const accountSets = [
  { id: 1, month: "2026-05", name: "2026年5月", is_active: true, is_locked: false },
  { id: 2, month: "2026-04", name: "2026年4月", is_active: false, is_locked: true },
];

describe("AccountSetSelector", () => {
  it("展示当前账套状态并在打开后展示结构化选项", () => {
    render(<AccountSetSelector accountSets={accountSets} value="2026-05" onChange={vi.fn()} />);

    expect(screen.getByText("当前账套")).toBeInTheDocument();
    expect(screen.getAllByText("2026年5月")).toHaveLength(2);
    expect(screen.getByText("当前激活")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /2026年4月/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox", { name: /当前账套/ }));

    expect(screen.getByRole("option", { name: /2026年4月/ })).toBeInTheDocument();
    expect(screen.getByText("已锁定")).toBeInTheDocument();
  });

  it("切换账套时只回传月份值", () => {
    const onChange = vi.fn();
    render(<AccountSetSelector accountSets={accountSets} value="2026-05" onChange={onChange} />);

    fireEvent.click(screen.getByRole("combobox", { name: /当前账套/ }));
    fireEvent.click(screen.getByRole("option", { name: /2026年4月/ }));

    expect(onChange).toHaveBeenCalledWith("2026-04");
  });

  it("没有账套时展示空状态", () => {
    render(<AccountSetSelector accountSets={[]} value="" onChange={vi.fn()} />);

    expect(screen.getAllByText("暂无可用账套")).toHaveLength(2);
    expect(screen.getByRole("combobox", { name: /当前账套/ })).toBeDisabled();
  });

  it("紧凑模式用单一字段明确展示当前账套", () => {
    render(<AccountSetSelector accountSets={accountSets} value="2026-05" onChange={vi.fn()} compact />);

    expect(screen.getByText("账套选择").closest(".account-set-selector")).toHaveClass("is-stacked");
    expect(screen.getByText("账套选择")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "账套选择：2026年5月" })).toHaveTextContent("2026年5月");
    expect(screen.queryByText("选择查询月份")).not.toBeInTheDocument();
  });
});
