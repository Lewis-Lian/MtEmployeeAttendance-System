import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import EmployeeBatchToolbar from "./EmployeeBatchToolbar";

describe("EmployeeBatchToolbar", () => {
  it("shows the selection summary and inline batch controls", () => {
    const onBatchActionChange = vi.fn();
    const onApply = vi.fn();
    const onDelete = vi.fn();
    const onClear = vi.fn();

    render(
      <EmployeeBatchToolbar
        batchAction="set_nursing"
        onApply={onApply}
        onBatchActionChange={onBatchActionChange}
        onClear={onClear}
        onDelete={onDelete}
        renderValueControl={() => <span>人员类型控件</span>}
        selectedCount={3}
      />,
    );

    const toolbar = screen.getByRole("region", { name: "员工批量操作" });
    expect(toolbar.querySelector("strong")?.textContent).toBe("3");
    expect(within(toolbar).getByText("人员类型控件")).toBeTruthy();

    fireEvent.click(within(toolbar).getByRole("button", { name: "应用到已选" }));
    fireEvent.click(within(toolbar).getByRole("button", { name: "批量删除" }));
    fireEvent.click(within(toolbar).getByRole("button", { name: "清空选择" }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
