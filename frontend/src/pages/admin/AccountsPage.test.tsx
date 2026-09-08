import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiRequestMock, notificationMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  notificationMock: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("../../api/client", () => ({ apiRequest: apiRequestMock }));
vi.mock("../../api/admin", () => ({
  fetchAdminDepartments: vi.fn(async () => []),
  fetchAdminEmployees: vi.fn(async () => [
    { id: 1, emp_no: "E001", name: "张三", dept_id: null, dept_name: "", is_manager: false },
    { id: 2, emp_no: "E002", name: "李四", dept_id: null, dept_name: "", is_manager: false },
  ]),
}));
vi.mock("../../components/feedback/Notification", () => ({
  useNotification: () => notificationMock,
}));
vi.mock("../../components/query/EmployeePicker", () => ({
  default: () => <div data-testid="employee-picker" />,
}));
vi.mock("../../components/query/DepartmentMultiPicker", () => ({
  default: () => <div data-testid="department-picker" />,
}));

import AccountsPage from "./AccountsPage";

const accountRows = [
  {
    id: 1,
    username: "readonly-user",
    role: "readonly",
    profile_emp_no: "E001",
    profile_name: "张三",
    profile_dept_id: null,
    profile_department: null,
    created_at: null,
    page_permissions: {},
    emp_ids: [],
    dept_ids: [],
    employees: [],
    departments: [],
  },
  {
    id: 2,
    username: "admin-user",
    role: "admin",
    profile_emp_no: "E002",
    profile_name: "李四",
    profile_dept_id: null,
    profile_department: null,
    created_at: null,
    page_permissions: {},
    emp_ids: [],
    dept_ids: [],
    employees: [],
    departments: [],
  },
];

describe("AccountsPage multi-selection", () => {
  beforeEach(() => {
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path === "/api/admin/accounts") {
        return accountRows;
      }
      return {};
    });
  });

  afterEach(() => {
    cleanup();
    apiRequestMock.mockReset();
  });

  it("取消当前筛选结果的全选时保留筛选外已选账号", async () => {
    render(<AccountsPage />);

    await screen.findByText("readonly-user");
    const headerCheckbox = screen.getAllByRole("checkbox")[0];
    fireEvent.click(headerCheckbox);

    fireEvent.change(screen.getByRole("combobox", { name: "是否管理员账号" }), {
      target: { value: "admin" },
    });
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(2));

    fireEvent.click(screen.getAllByRole("checkbox")[0]);

    const selectedLabel = screen.getByText("已选择 1 个账号");
    const batchToolbar = selectedLabel.closest("section");
    expect(batchToolbar).not.toBeNull();
    expect(within(batchToolbar as HTMLElement).getByText("已选择 1 个账号")).toBeInTheDocument();
    expect(within(batchToolbar as HTMLElement).getByRole("button", { name: "删除账号" })).toBeInTheDocument();
  });

  it("当前筛选结果全选时不会覆盖筛选外已选账号", async () => {
    render(<AccountsPage />);

    await screen.findByText("readonly-user");
    fireEvent.click(screen.getAllByLabelText("选择账号行")[0]);
    fireEvent.change(screen.getByRole("combobox", { name: "是否管理员账号" }), {
      target: { value: "admin" },
    });
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(2));

    fireEvent.click(screen.getByLabelText("选择当前筛选结果"));

    const selectedLabel = screen.getByText("已选择 2 个账号");
    const batchToolbar = selectedLabel.closest("section");
    expect(within(batchToolbar as HTMLElement).getByText("已选择 2 个账号")).toBeInTheDocument();
  });

  it("批量操作提交当前已选账号 ID", async () => {
    render(<AccountsPage />);

    await screen.findByText("readonly-user");
    fireEvent.click(screen.getAllByLabelText("选择账号行")[1]);
    fireEvent.click(screen.getByRole("button", { name: "删除账号" }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith("/api/admin/users/batch", {
        body: { action: "delete", user_ids: [2] },
        method: "POST",
      });
    });
  });

  it("批量工具条可以一键清除当前选择", async () => {
    render(<AccountsPage />);

    await screen.findByText("readonly-user");
    fireEvent.click(screen.getAllByLabelText("选择账号行")[0]);

    fireEvent.click(screen.getByRole("button", { name: "清除选择" }));

    expect(screen.queryByText(/已选择 \d+ 个账号/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除账号" })).not.toBeInTheDocument();
  });
});
