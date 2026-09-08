import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchEmployees = vi.hoisted(() => vi.fn());
const mockFetchDepartments = vi.hoisted(() => vi.fn());
const mockFetchShifts = vi.hoisted(() => vi.fn());
const mockResign = vi.hoisted(() => vi.fn());
const mockReinstate = vi.hoisted(() => vi.fn());
const mockCreateEmployee = vi.hoisted(() => vi.fn());
const mockUpdateEmployee = vi.hoisted(() => vi.fn());
const mockConfirm = vi.hoisted(() => vi.fn());
const mockBatchEmployees = vi.hoisted(() => vi.fn());

vi.mock("../../api/admin", () => ({
  fetchAdminEmployees: mockFetchEmployees,
  fetchAdminDepartments: mockFetchDepartments,
  fetchAdminShifts: mockFetchShifts,
  resignAdminEmployee: mockResign,
  reinstateAdminEmployee: mockReinstate,
  createAdminEmployee: mockCreateEmployee,
  updateAdminEmployee: mockUpdateEmployee,
  deleteAdminEmployee: vi.fn(),
  batchAdminEmployees: mockBatchEmployees,
  importAdminEmployees: vi.fn(),
}));
vi.mock("../../components/feedback/Notification", () => ({
  useNotification: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));
vi.mock("../../components/feedback/ConfirmDialog", () => ({
  useConfirm: () => mockConfirm,
}));

import EmployeesPage from "./EmployeesPage";

const employees = [
  { id: 1, emp_no: "E100", name: "在职员工", card_no: "K100", dept_name: "行政部", is_manager: false, resigned_at: null },
  { id: 2, emp_no: "E200", name: "已离职员工", card_no: null, dept_name: "行政部", is_manager: false, resigned_at: "2026-08-31" },
  { id: 3, emp_no: "E300", name: "重名员工", card_no: "K300", dept_name: "财务部", is_manager: false, resigned_at: null },
  { id: 4, emp_no: "E400", name: "重名员工", card_no: null, dept_name: "人事部", is_manager: false, resigned_at: null },
  { id: 5, emp_no: "E500", name: "卡号员工", card_no: "7891", dept_name: "行政部", is_manager: false, resigned_at: null },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EmployeesPage 离职功能", () => {
  beforeEach(() => {
    mockFetchEmployees.mockResolvedValue(employees);
    mockFetchDepartments.mockResolvedValue([]);
    mockFetchShifts.mockResolvedValue([]);
    mockConfirm.mockResolvedValue(true);
  });

  it("默认仅显示在职员工，全量拉取数据", async () => {
    render(<EmployeesPage />);
    await waitFor(() => expect(mockFetchEmployees).toHaveBeenCalledWith("all"));

    expect(await screen.findByText("在职员工")).toBeTruthy();
    expect(screen.queryByText("已离职员工")).toBeNull();
  });

  it("筛选已离职后显示离职员工及其离职日期", async () => {
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.change(screen.getByLabelText("在职状态"), { target: { value: "resigned" } });

    expect(await screen.findByText("已离职员工")).toBeTruthy();
    expect(screen.getByText(/2026-08-31/)).toBeTruthy();
    expect(screen.queryByText("在职员工")).toBeNull();
  });

  it("办理离职弹窗提交工号与日期", async () => {
    mockResign.mockResolvedValue({ status: "ok", employee: employees[0] });
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    // 顶部"办理离职"按钮与行内按钮同名，取第一个（顶部主入口）
    fireEvent.click(screen.getAllByRole("button", { name: "办理离职" })[0]);
    fireEvent.change(await screen.findByLabelText("离职人员编号/姓名/卡号"), { target: { value: "E100" } });
    fireEvent.click(screen.getByRole("button", { name: "确认离职" }));

    await waitFor(() =>
      expect(mockResign).toHaveBeenCalledWith(
        expect.objectContaining({ emp_no: "E100", resigned_at: expect.any(String) }),
      ),
    );
  });

  it("已离职行通过更多操作菜单提供恢复在职", async () => {
    mockReinstate.mockResolvedValue({ status: "ok", employee: employees[1] });
    render(<EmployeesPage />);
    await screen.findByText("在职员工");
    fireEvent.change(screen.getByLabelText("在职状态"), { target: { value: "resigned" } });

    fireEvent.click(await screen.findByRole("button", { name: "更多操作" }));
    fireEvent.click(await screen.findByRole("button", { name: "恢复在职" }));

    await waitFor(() => expect(mockReinstate).toHaveBeenCalledWith(2));
  });

  it("在职行通过更多操作菜单发起办理离职并预填工号", async () => {
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.click(screen.getAllByRole("button", { name: "更多操作" })[0]);
    // 顶部"办理离职"主入口与菜单项同名，取最后渲染的菜单项
    const resignButtons = screen.getAllByRole("button", { name: "办理离职" });
    fireEvent.click(resignButtons[resignButtons.length - 1]);

    expect(await screen.findByLabelText("离职人员编号/姓名/卡号")).toHaveValue("E100");
  });

  it("办理离职输入在职员工工号后回显灰色只读信息供核对", async () => {
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.click(screen.getAllByRole("button", { name: "办理离职" })[0]);
    fireEvent.change(await screen.findByLabelText("离职人员编号/姓名/卡号"), { target: { value: "E100" } });

    const preview = await screen.findByTestId("resign-employee-preview");
    expect(within(preview).getByText("在职员工")).toBeTruthy();
    expect(within(preview).getByText("行政部")).toBeTruthy();
    expect(within(preview).getByText("普通员工")).toBeTruthy();
    expect(within(preview).getByText("在职")).toBeTruthy();
  });

  it("办理离职输入未登记工号时提示未找到", async () => {
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.click(screen.getAllByRole("button", { name: "办理离职" })[0]);
    fireEvent.change(await screen.findByLabelText("离职人员编号/姓名/卡号"), { target: { value: "E999" } });

    const preview = await screen.findByTestId("resign-employee-preview");
    expect(within(preview).getByText(/未找到/)).toBeTruthy();
  });

  it("办理离职输入已离职工号时回显信息并警示已离职", async () => {
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.click(screen.getAllByRole("button", { name: "办理离职" })[0]);
    fireEvent.change(await screen.findByLabelText("离职人员编号/姓名/卡号"), { target: { value: "E200" } });

    const preview = await screen.findByTestId("resign-employee-preview");
    expect(within(preview).getByText("已离职员工")).toBeTruthy();
    expect(within(preview).getByText(/已于 2026-08-31 离职/)).toBeTruthy();
  });

  it("办理离职输入姓名后回显唯一匹配员工信息并显示工号", async () => {
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.click(screen.getAllByRole("button", { name: "办理离职" })[0]);
    fireEvent.change(await screen.findByLabelText("离职人员编号/姓名/卡号"), { target: { value: "在职员工" } });

    const preview = await screen.findByTestId("resign-employee-preview");
    expect(within(preview).getByText("E100")).toBeTruthy();
    expect(within(preview).getByText("在职员工")).toBeTruthy();
    expect(within(preview).getByText("行政部")).toBeTruthy();
    expect(within(preview).getByText("在职")).toBeTruthy();
  });

  it("办理离职输入重名姓名时列出候选并提示改用编号", async () => {
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.click(screen.getAllByRole("button", { name: "办理离职" })[0]);
    fireEvent.change(await screen.findByLabelText("离职人员编号/姓名/卡号"), { target: { value: "重名员工" } });

    const preview = await screen.findByTestId("resign-employee-preview");
    expect(preview.textContent).toContain("该姓名对应 2 名员工，请输入人员编号精确办理");
    expect(within(preview).getByText("E300")).toBeTruthy();
    expect(within(preview).getByText("E400")).toBeTruthy();
  });

  it("办理离职输入卡号后回显匹配员工信息", async () => {
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.click(screen.getAllByRole("button", { name: "办理离职" })[0]);
    fireEvent.change(await screen.findByLabelText("离职人员编号/姓名/卡号"), { target: { value: "K100" } });

    const preview = await screen.findByTestId("resign-employee-preview");
    expect(within(preview).getByText("E100")).toBeTruthy();
    expect(within(preview).getByText("在职员工")).toBeTruthy();
    expect(within(preview).getByText("在职")).toBeTruthy();
  });

  it("办理离职输入带前导零的卡号仍可匹配员工", async () => {
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.click(screen.getAllByRole("button", { name: "办理离职" })[0]);
    fireEvent.change(await screen.findByLabelText("离职人员编号/姓名/卡号"), { target: { value: "0007891" } });

    const preview = await screen.findByTestId("resign-employee-preview");
    expect(within(preview).getByText("E500")).toBeTruthy();
    expect(within(preview).getByText("卡号员工")).toBeTruthy();
    expect(within(preview).getByText("在职")).toBeTruthy();
  });

  it("办理离职输入卡号提交时按解析出的工号调用接口", async () => {
    mockResign.mockResolvedValue({ status: "ok", employee: employees[0] });
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.click(screen.getAllByRole("button", { name: "办理离职" })[0]);
    fireEvent.change(await screen.findByLabelText("离职人员编号/姓名/卡号"), { target: { value: "K100" } });
    fireEvent.click(screen.getByRole("button", { name: "确认离职" }));

    await waitFor(() =>
      expect(mockResign).toHaveBeenCalledWith(
        expect.objectContaining({ emp_no: "E100", resigned_at: expect.any(String) }),
      ),
    );
  });

  it("办理离职输入带前导零的卡号提交时按解析出的工号调用接口", async () => {
    mockResign.mockResolvedValue({ status: "ok", employee: employees[4] });
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.click(screen.getAllByRole("button", { name: "办理离职" })[0]);
    fireEvent.change(await screen.findByLabelText("离职人员编号/姓名/卡号"), { target: { value: "0007891" } });
    fireEvent.click(screen.getByRole("button", { name: "确认离职" }));

    await waitFor(() =>
      expect(mockResign).toHaveBeenCalledWith(
        expect.objectContaining({ emp_no: "E500", resigned_at: expect.any(String) }),
      ),
    );
  });

  it("办理离职成功后弹窗保持打开", async () => {
    mockResign.mockResolvedValue({ status: "ok", employee: employees[0] });
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.click(screen.getAllByRole("button", { name: "办理离职" })[0]);
    fireEvent.change(await screen.findByLabelText("离职人员编号/姓名/卡号"), { target: { value: "E100" } });
    fireEvent.click(screen.getByRole("button", { name: "确认离职" }));

    await waitFor(() => expect(mockResign).toHaveBeenCalledTimes(1));
    expect(await screen.findByLabelText("离职人员编号/姓名/卡号")).toBeTruthy();
    expect(screen.getByRole("button", { name: "确认离职" })).toBeTruthy();
  });

  it("办理离职成功后清空输入框并聚焦以便继续办理", async () => {
    mockResign.mockResolvedValue({ status: "ok", employee: employees[0] });
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.click(screen.getAllByRole("button", { name: "办理离职" })[0]);
    fireEvent.change(await screen.findByLabelText("离职人员编号/姓名/卡号"), { target: { value: "E100" } });
    fireEvent.click(screen.getByRole("button", { name: "确认离职" }));

    await waitFor(() => expect(mockResign).toHaveBeenCalledTimes(1));
    const input = await waitFor(() => {
      const el = screen.getByLabelText("离职人员编号/姓名/卡号");
      expect(el).toHaveValue("");
      expect(document.activeElement).toBe(el);
      return el;
    });
    expect(input).toBeTruthy();
  });

  it("办理离职输入姓名提交时按解析出的工号调用接口", async () => {
    mockResign.mockResolvedValue({ status: "ok", employee: employees[0] });
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.click(screen.getAllByRole("button", { name: "办理离职" })[0]);
    fireEvent.change(await screen.findByLabelText("离职人员编号/姓名/卡号"), { target: { value: "在职员工" } });
    fireEvent.click(screen.getByRole("button", { name: "确认离职" }));

    await waitFor(() =>
      expect(mockResign).toHaveBeenCalledWith(
        expect.objectContaining({ emp_no: "E100", resigned_at: expect.any(String) }),
      ),
    );
  });

  it("办理离职输入重名姓名时不发起提交", async () => {
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.click(screen.getAllByRole("button", { name: "办理离职" })[0]);
    fireEvent.change(await screen.findByLabelText("离职人员编号/姓名/卡号"), { target: { value: "重名员工" } });
    fireEvent.click(screen.getByRole("button", { name: "确认离职" }));

    expect(mockResign).not.toHaveBeenCalled();
  });
});

describe("EmployeesPage 多选功能", () => {
  beforeEach(() => {
    mockFetchEmployees.mockResolvedValue(employees);
    mockFetchDepartments.mockResolvedValue([]);
    mockFetchShifts.mockResolvedValue([]);
    mockBatchEmployees.mockResolvedValue({ status: "ok", affected: 1 });
    mockConfirm.mockResolvedValue(true);
  });

  it("取消当前筛选结果的全选时保留其他筛选结果之外的已选员工", async () => {
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    const selectAll = screen.getByLabelText("选择当前筛选结果");
    fireEvent.click(selectAll);
    fireEvent.change(screen.getByLabelText("关键词"), { target: { value: "E300" } });
    fireEvent.click(screen.getByLabelText("选择当前筛选结果"));

    expect(screen.getByRole("region", { name: "员工批量操作" }).querySelector("strong")?.textContent).toBe("3");
  });

  it("批量工具条提交当前选中的员工", async () => {
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.click(screen.getAllByLabelText("选择员工行")[0]);
    fireEvent.change(screen.getByLabelText("批量操作"), { target: { value: "set_nursing" } });
    fireEvent.change(screen.getByLabelText("设置哺乳假"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "应用到已选" }));

    await waitFor(() =>
      expect(mockBatchEmployees).toHaveBeenCalledWith({ ids: [1], action: "set_nursing", is_nursing: true }),
    );
  });

  it("选择批量操作后在工具条内显示输入控件", async () => {
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.click(screen.getAllByLabelText("选择员工行")[0]);

    expect(screen.queryByRole("dialog", { name: "批量操作" })).toBeNull();
    fireEvent.change(screen.getByLabelText("批量操作"), { target: { value: "set_name" } });

    expect(screen.getByRole("region", { name: "员工批量操作" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "员工批量操作" }).querySelector("strong")?.textContent).toBe("1");
    expect(screen.queryByRole("dialog", { name: "批量操作" })).toBeNull();
    expect(screen.getByLabelText("批量设置值")).toBeTruthy();
  });
});

describe("EmployeesPage 卡号功能", () => {
  beforeEach(() => {
    mockFetchEmployees.mockResolvedValue(employees);
    mockFetchDepartments.mockResolvedValue([]);
    mockFetchShifts.mockResolvedValue([]);
    mockConfirm.mockResolvedValue(true);
  });

  it("员工表格显示卡号列", async () => {
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    expect(screen.getAllByText("卡号").length).toBeGreaterThan(0);
    expect(screen.getByText("K100")).toBeTruthy();
  });

  it("新建员工表单支持填写卡号并随 payload 提交", async () => {
    mockCreateEmployee.mockResolvedValue({ status: "ok", employee: employees[0] });
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.click(screen.getByRole("button", { name: /新建员工/ }));
    fireEvent.change(await screen.findByLabelText("人员编号"), { target: { value: "E900" } });
    fireEvent.change(screen.getByLabelText("人员姓名"), { target: { value: "新员工" } });
    fireEvent.change(screen.getByLabelText("卡号"), { target: { value: "K900" } });
    fireEvent.click(screen.getByRole("button", { name: "创建员工" }));

    await waitFor(() =>
      expect(mockCreateEmployee).toHaveBeenCalledWith(
        expect.objectContaining({ emp_no: "E900", name: "新员工", card_no: "K900" }),
      ),
    );
  });

  it("编辑员工回填卡号并随更新提交", async () => {
    mockUpdateEmployee.mockResolvedValue({ status: "ok", employee: employees[0] });
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.click(screen.getAllByRole("button", { name: "编辑" })[0]);
    // 新建表单常驻 DOM 也带卡号输入框，取已回填 K100 的那个（编辑弹窗内）
    const editCardInput = (await screen.findAllByLabelText("卡号")).find(
      (el): el is HTMLInputElement => el instanceof HTMLInputElement && el.value === "K100",
    );
    expect(editCardInput).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(mockUpdateEmployee).toHaveBeenCalledWith(1, expect.objectContaining({ card_no: "K100" })),
    );
  });

  it("关键词搜索覆盖卡号", async () => {
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.change(screen.getByLabelText("关键词"), { target: { value: "K100" } });

    expect(screen.getByText("在职员工")).toBeTruthy();
    expect(screen.queryByText("重名员工")).toBeNull();
  });

  it("导入弹窗的模板列要求说明包含卡号", async () => {
    render(<EmployeesPage />);
    await screen.findByText("在职员工");

    fireEvent.click(screen.getByRole("button", { name: /导入\/导出员工/ }));

    expect(await screen.findByText(/人员编号、人员姓名、卡号（选填/)).toBeTruthy();
    expect(screen.getByText(/留空将清空已有卡号/)).toBeTruthy();
  });
});
