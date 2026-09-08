import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import QueryTable from "./QueryTable";

afterEach(() => {
  cleanup();
});

describe("QueryTable", () => {
  it("表格底部分页按旧版结构显示总数、页数和跳转", () => {
    const rows = Array.from({ length: 101 }, (_, index) => [`员工${index + 1}`]);
    const { container } = render(<QueryTable headers={["姓名"]} rows={rows} />);

    expect(container.querySelector(".table-pager")).not.toBeNull();
    expect(screen.getByText("共 101 条记录")).toBeInTheDocument();
    expect(screen.getByText("第 1 / 2 页")).toBeInTheDocument();
    expect(screen.getByText("员工100")).toBeInTheDocument();
    expect(screen.queryByText("员工101")).toBeNull();
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    expect(screen.getByText("第 2 / 2 页")).toBeInTheDocument();
    expect(screen.getByText("员工101")).toBeInTheDocument();
    expect(screen.queryByText("员工100")).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("页码"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "跳转" }));

    expect(screen.getByText("第 1 / 2 页")).toBeInTheDocument();
    expect((screen.getByPlaceholderText("页码") as HTMLInputElement).value).toBe("1");
  });

  it("每页数量和空数据分页表现与旧版一致", () => {
    const rows = Array.from({ length: 60 }, (_, index) => [`员工${index + 1}`]);
    const { container, rerender } = render(<QueryTable headers={["姓名"]} rows={rows} />);

    fireEvent.change(container.querySelector(".table-pager select") as HTMLSelectElement, {
      target: { value: "50" },
    });

    expect(screen.getByText("第 1 / 2 页")).toBeInTheDocument();
    expect(screen.queryByText("员工51")).toBeNull();

    rerender(<QueryTable headers={["姓名"]} rows={[]} emptyText="暂无数据" />);

    expect(screen.getByText("暂无数据")).toBeInTheDocument();
    expect(container.querySelector(".table-pager")).toBeNull();
  });

  it("表格滚动区域支持鼠标拖动浏览", () => {
    const rows = Array.from({ length: 3 }, (_, rowIndex) =>
      Array.from({ length: 8 }, (_, columnIndex) => `R${rowIndex + 1}C${columnIndex + 1}`),
    );
    const { container } = render(
      <QueryTable
        headers={Array.from({ length: 8 }, (_, index) => `列${index + 1}`)}
        rows={rows}
      />,
    );

    const tableWrap = container.querySelector(".legacy-table-wrap") as HTMLDivElement;
    fireEvent.mouseDown(tableWrap, { clientX: 100, clientY: 100 });

    expect(tableWrap.classList.contains("is-dragging")).toBe(true);

    fireEvent.mouseMove(window, { clientX: 60, clientY: 70 });

    expect(tableWrap.scrollLeft).toBe(40);
    expect(tableWrap.scrollTop).toBe(30);

    fireEvent.mouseUp(window);

    expect(tableWrap.classList.contains("is-dragging")).toBe(false);
  });

  it("结果行按顺序设置入场动效，并支持刷新状态", () => {
    const { container } = render(
      <QueryTable headers={["姓名"]} rows={[["员工甲"], ["员工乙"]]} isRefreshing />,
    );

    const rows = Array.from(container.querySelectorAll("tbody tr"));
    expect(container.querySelector(".legacy-table-panel.is-refreshing")).not.toBeNull();
    expect(rows.map((row) => row.className)).toEqual(["query-table-row", "query-table-row"]);
    expect(rows.map((row) => row.getAttribute("style"))).toEqual([
      "--query-row-index: 0;",
      "--query-row-index: 1;",
    ]);
  });

  it("点击表头会按旧版行为在升序和降序之间切换", () => {
    const rows = [
      ["E003", "员工丙", "12"],
      ["E001", "员工甲", "20"],
      ["E002", "员工乙", "8"],
    ];

    render(<QueryTable headers={["工号", "姓名", "考勤天数"]} rows={rows} />);

    fireEvent.click(screen.getByRole("button", { name: "工号" }));

    const bodyRowsAfterAsc = screen.getAllByRole("row").slice(1);
    expect(bodyRowsAfterAsc[0]).toHaveTextContent("E001");
    expect(bodyRowsAfterAsc[1]).toHaveTextContent("E002");
    expect(bodyRowsAfterAsc[2]).toHaveTextContent("E003");

    fireEvent.click(screen.getByRole("button", { name: "工号" }));

    const bodyRowsAfterDesc = screen.getAllByRole("row").slice(1);
    expect(bodyRowsAfterDesc[0]).toHaveTextContent("E003");
    expect(bodyRowsAfterDesc[1]).toHaveTextContent("E002");
    expect(bodyRowsAfterDesc[2]).toHaveTextContent("E001");
  });

  it("排序状态会显示在表头上，并支持按数值排序", () => {
    const rows = [
      ["E003", "员工丙", "12"],
      ["E001", "员工甲", "20"],
      ["E002", "员工乙", "8"],
    ];

    render(<QueryTable headers={["工号", "姓名", "考勤天数"]} rows={rows} />);

    const daysButton = screen.getByRole("button", { name: "考勤天数" });
    fireEvent.click(daysButton);

    expect(daysButton).toHaveAttribute("aria-sort", "ascending");
    let bodyRows = screen.getAllByRole("row").slice(1);
    expect(bodyRows[0]).toHaveTextContent("8");
    expect(bodyRows[2]).toHaveTextContent("20");

    fireEvent.click(daysButton);

    expect(daysButton).toHaveAttribute("aria-sort", "descending");
    bodyRows = screen.getAllByRole("row").slice(1);
    expect(bodyRows[0]).toHaveTextContent("20");
    expect(bodyRows[2]).toHaveTextContent("8");
  });

  it("支持点击指定单元格后以弹框展示异步加载内容", async () => {
    render(
      <QueryTable
        headers={["工号", "考勤天数"]}
        rows={[["E001", "20"]]}
        rowMeta={[{ empId: 1 }]}
        cellModal={{
          getModal: ({ headerLabel, rowMeta }) => {
            if (headerLabel !== "考勤天数") {
              return null;
            }
            return {
              title: `员工 ${String((rowMeta as { empId: number }).empId)} 原始刷卡记录`,
              triggerLabel: "查看员工 1 的原始刷卡记录",
              loadContent: async () => <div>08:00,17:30</div>,
            };
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "查看员工 1 的原始刷卡记录" }));

    expect(await screen.findByRole("heading", { name: "员工 1 原始刷卡记录" })).toBeInTheDocument();
    expect(await screen.findByText("08:00,17:30")).toBeInTheDocument();
  });

  it("详情弹框会通过 portal 挂到 document.body，避免被表格容器裁切", async () => {
    const originalNodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV;
    const originalWindowNodeEnv = (window as Window & { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV;
    (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process = { env: { NODE_ENV: "development" } };
    (window as Window & { process?: { env?: { NODE_ENV?: string } } }).process = { env: { NODE_ENV: "development" } };

    render(
      <QueryTable
        headers={["工号", "考勤天数"]}
        rows={[["E001", "20"]]}
        rowMeta={[{ empId: 1 }]}
        cellModal={{
          getModal: ({ headerLabel }) =>
            headerLabel === "考勤天数"
              ? {
                  title: "详情弹框",
                  triggerLabel: "打开详情弹框",
                  loadContent: async () => <div>详情内容</div>,
                }
              : null,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开详情弹框" }));

    const dialog = await screen.findByRole("dialog", { name: "查询详情" });
    expect(dialog.parentElement).toBe(document.body);
    expect(await screen.findByText("详情内容")).toBeInTheDocument();

    (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process = { env: { NODE_ENV: originalNodeEnv } };
    (window as Window & { process?: { env?: { NODE_ENV?: string } } }).process = { env: { NODE_ENV: originalWindowNodeEnv } };
  });
});
