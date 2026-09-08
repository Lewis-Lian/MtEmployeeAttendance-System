import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MockResponseInit {
  status?: number;
  headers?: Record<string, string>;
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.resetModules();
  window.history.replaceState({}, "", "/");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App smoke regression", () => {
  it("未登录访问受保护页面时会跳转到 /login", async () => {
    window.history.replaceState({}, "", "/employee/home");
    fetchMock.mockImplementation((input) => {
      const path = normalizePath(input);
      if (path === "/api/auth/me") {
        return Promise.resolve(jsonResponse({ error: "Unauthorized" }, { status: 401 }));
      }
      throw new Error(`unexpected request: ${path}`);
    });

    const { default: App } = await import("./App");
    const { container } = render(<App />);

    expect(await screen.findByRole("heading", { name: "欢迎回来！" })).toBeInTheDocument();
    expect(container.querySelectorAll(".mtemphub-logo").length).toBeGreaterThan(0);
    expect(screen.queryByText("用一处入口管理每天的考勤节奏")).not.toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/login"));
  });

  it("登录页提供 CareerCompass 同款修改密码入口", async () => {
    window.history.replaceState({}, "", "/login");
    fetchMock.mockImplementation((input) => {
      const path = normalizePath(input);
      if (path === "/api/auth/me") {
        return Promise.resolve(jsonResponse({ error: "Unauthorized" }, { status: 401 }));
      }
      throw new Error(`unexpected request: ${path}`);
    });

    const { default: App } = await import("./App");
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: "修改密码" }));

    expect(await screen.findByRole("heading", { name: "修改密码" })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/change-password"));
  });

  it("登录页移除机器人验证后可直接提交", async () => {
    window.history.replaceState({}, "", "/login");
    fetchMock.mockImplementation((input, init) => {
      const path = normalizePath(input);
      if (path === "/api/auth/me") {
        return Promise.resolve(jsonResponse({ error: "Unauthorized" }, { status: 401 }));
      }
      if (path === "/api/auth/captcha/slider") {
        return Promise.resolve(
          jsonResponse({
            challenge_id: "test-challenge",
            token: "test-slider-token",
            background: "data:image/png;base64,iVBORw0KGgo=",
            slider: "data:image/png;base64,iVBORw0KGgo=",
            slider_width: 44,
          }),
        );
      }
      if (path === "/api/auth/captcha/slider/verify") {
        return Promise.resolve(jsonResponse({ verified_token: "test-verified-token" }));
      }
      if (path === "/api/auth/login") {
        expect(JSON.parse(String(init?.body))).toEqual({
          username: "admin",
          password: "admin123",
          remember_me: false,
          captcha_token: "test-verified-token",
        });
        return Promise.resolve(
          jsonResponse({
            user: {
              id: 1,
              username: "admin",
              role: "admin",
              page_permissions: { query_home: true },
            },
          }),
        );
      }
      throw new Error(`unexpected request: ${path}`);
    });

    const { default: App } = await import("./App");
    render(<App />);

    fireEvent.change(await screen.findByLabelText("账号"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "admin123" } });
    const loginButton = screen.getByRole("button", { name: "登录" });

    expect(screen.queryByRole("button", { name: "使用 Google 登录" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "注册" })).not.toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: "滑动完成验证" })).not.toBeInTheDocument();
    expect(loginButton).toBeEnabled();

    await completeSliderCaptcha();
    fireEvent.click(loginButton);

    await waitFor(() => expect(window.location.pathname).toBe("/employee/home"));
  });

  it("登录页会把记住我一起提交给登录接口", async () => {
    window.history.replaceState({}, "", "/login");
    let loginBody: unknown = null;
    fetchMock.mockImplementation((input, init) => {
      const path = normalizePath(input);
      if (path === "/api/auth/me") {
        return Promise.resolve(jsonResponse({ error: "Unauthorized" }, { status: 401 }));
      }
      if (path === "/api/auth/captcha/slider") {
        return Promise.resolve(
          jsonResponse({
            challenge_id: "test-challenge",
            token: "test-slider-token",
            background: "data:image/png;base64,iVBORw0KGgo=",
            slider: "data:image/png;base64,iVBORw0KGgo=",
            slider_width: 44,
          }),
        );
      }
      if (path === "/api/auth/captcha/slider/verify") {
        return Promise.resolve(jsonResponse({ verified_token: "test-verified-token" }));
      }
      if (path === "/api/auth/login") {
        loginBody = JSON.parse(String(init?.body));
        return Promise.resolve(
          jsonResponse({
            user: {
              id: 1,
              username: "admin",
              role: "admin",
              page_permissions: { query_home: true },
            },
          }),
        );
      }
      throw new Error(`unexpected request: ${path}`);
    });

    const { default: App } = await import("./App");
    render(<App />);

    fireEvent.change(await screen.findByLabelText("账号"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "admin123" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "30 天内记住我" }));
    await completeSliderCaptcha();
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() =>
      expect(loginBody).toEqual({
        username: "admin",
        password: "admin123",
        remember_me: true,
        captcha_token: "test-verified-token",
      }),
    );
  });

  it("账号输入框聚焦时会触发左侧角色互看动画", async () => {
    window.history.replaceState({}, "", "/login");
    fetchMock.mockImplementation((input) => {
      const path = normalizePath(input);
      if (path === "/api/auth/me") {
        return Promise.resolve(jsonResponse({ error: "Unauthorized" }, { status: 401 }));
      }
      throw new Error(`unexpected request: ${path}`);
    });

    const { default: App } = await import("./App");
    render(<App />);

    const purpleEyes = await screen.findByTestId("animated-purple-eyes");
    const beforeFocusLeft = purpleEyes.getAttribute("style") ?? "";

    fireEvent.focus(screen.getByLabelText("账号"));

    const afterFocusLeft = purpleEyes.getAttribute("style") ?? "";
    expect(beforeFocusLeft).toContain("left: 45px");
    expect(afterFocusLeft).toContain("left: 55px");
  });

  it("明文显示密码时会触发紫色角色偷看姿态", async () => {
    window.history.replaceState({}, "", "/login");
    fetchMock.mockImplementation((input) => {
      const path = normalizePath(input);
      if (path === "/api/auth/me") {
        return Promise.resolve(jsonResponse({ error: "Unauthorized" }, { status: 401 }));
      }
      throw new Error(`unexpected request: ${path}`);
    });

    const { default: App } = await import("./App");
    render(<App />);

    const purpleCharacter = await screen.findByTestId("animated-purple-character");
    const purpleEyes = screen.getByTestId("animated-purple-eyes");

    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "admin123" } });
    fireEvent.click(screen.getByRole("button", { name: "显示密码" }));

    expect(purpleCharacter.getAttribute("style") ?? "").toContain("height: 400px");
    expect(purpleCharacter.getAttribute("style") ?? "").toContain("transform: skewX(0deg)");
    expect(purpleEyes.getAttribute("style") ?? "").toContain("left: 20px");
    expect(purpleEyes.getAttribute("style") ?? "").toContain("top: 35px");
  });

  it("修改密码页使用原密码验证并提交到改密接口", async () => {
    window.history.replaceState({}, "", "/change-password");
    let changePasswordBody: unknown = null;
    fetchMock.mockImplementation((input, init) => {
      const path = normalizePath(input);
      if (path === "/api/auth/me") {
        return Promise.resolve(jsonResponse({ error: "Unauthorized" }, { status: 401 }));
      }
      if (path === "/api/auth/captcha/slider") {
        return Promise.resolve(
          jsonResponse({
            challenge_id: "test-challenge",
            token: "test-slider-token",
            background: "data:image/png;base64,iVBORw0KGgo=",
            slider: "data:image/png;base64,iVBORw0KGgo=",
            slider_width: 44,
          }),
        );
      }
      if (path === "/api/auth/captcha/slider/verify") {
        return Promise.resolve(jsonResponse({ verified_token: "test-verified-token" }));
      }
      if (path === "/api/auth/change-password") {
        changePasswordBody = JSON.parse(String(init?.body));
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      throw new Error(`unexpected request: ${path}`);
    });

    const { default: App } = await import("./App");
    render(<App />);

    fireEvent.change(await screen.findByLabelText("用户名"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("原密码"), { target: { value: "admin123" } });
    fireEvent.change(screen.getByLabelText("新密码"), { target: { value: "newpass123" } });
    fireEvent.change(screen.getByLabelText("确认新密码"), { target: { value: "newpass123" } });

    // 滑块组件默认折叠，需先点开再拖动完成验证。
    await completeSliderCaptcha();

    fireEvent.click(screen.getByRole("button", { name: "确认修改" }));

    expect((await screen.findAllByText("密码修改成功，请使用新密码登录。"))[0]).toBeInTheDocument();
    expect(changePasswordBody).toEqual({
      username: "admin",
      current_password: "admin123",
      new_password: "newpass123",
      confirm_password: "newpass123",
      captcha_token: "test-verified-token",
    });
  });

  it("修改密码页聚焦用户名时会触发左侧角色互看动画", async () => {
    window.history.replaceState({}, "", "/change-password");
    fetchMock.mockImplementation((input) => {
      const path = normalizePath(input);
      if (path === "/api/auth/me") {
        return Promise.resolve(jsonResponse({ error: "Unauthorized" }, { status: 401 }));
      }
      if (path === "/api/auth/captcha/slider") {
        return Promise.resolve(
          jsonResponse({
            challenge_id: "test",
            token: "t",
            background: "data:image/png;base64,iVBORw0KGgo=",
            slider: "data:image/png;base64,iVBORw0KGgo=",
            slider_width: 44,
          }),
        );
      }
      throw new Error(`unexpected request: ${path}`);
    });

    const { default: App } = await import("./App");
    render(<App />);

    const purpleEyes = await screen.findByTestId("animated-purple-eyes");
    const beforeFocusLeft = purpleEyes.getAttribute("style") ?? "";

    fireEvent.focus(screen.getByLabelText("用户名"));

    const afterFocusLeft = purpleEyes.getAttribute("style") ?? "";
    expect(beforeFocusLeft).toContain("left: 45px");
    expect(afterFocusLeft).toContain("left: 55px");
  });

  it("修改密码页明文显示密码时会触发紫色角色偷看姿态", async () => {
    window.history.replaceState({}, "", "/change-password");
    fetchMock.mockImplementation((input) => {
      const path = normalizePath(input);
      if (path === "/api/auth/me") {
        return Promise.resolve(jsonResponse({ error: "Unauthorized" }, { status: 401 }));
      }
      if (path === "/api/auth/captcha/slider") {
        return Promise.resolve(
          jsonResponse({
            challenge_id: "test",
            token: "t",
            background: "data:image/png;base64,iVBORw0KGgo=",
            slider: "data:image/png;base64,iVBORw0KGgo=",
            slider_width: 44,
          }),
        );
      }
      throw new Error(`unexpected request: ${path}`);
    });

    const { default: App } = await import("./App");
    render(<App />);

    const purpleCharacter = await screen.findByTestId("animated-purple-character");
    const purpleEyes = screen.getByTestId("animated-purple-eyes");

    fireEvent.change(screen.getByLabelText("原密码"), { target: { value: "admin123" } });
    fireEvent.click(screen.getAllByRole("button", { name: "显示密码" })[0]);

    expect(purpleCharacter.getAttribute("style") ?? "").toContain("height: 400px");
    expect(purpleCharacter.getAttribute("style") ?? "").toContain("transform: skewX(0deg)");
    expect(purpleEyes.getAttribute("style") ?? "").toContain("left: 20px");
    expect(purpleEyes.getAttribute("style") ?? "").toContain("top: 35px");
  });

  it("已登录普通用户会落到默认首页并挂载查询页", async () => {
    window.history.replaceState({}, "", "/login");
    fetchMock.mockImplementation((input) => mockEmployeeAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "管理人员首页概览" })).toBeInTheDocument();
    expect(await screen.findAllByText("查询中心")).not.toHaveLength(0);
    expect(await screen.findAllByRole("button", { name: "退出登录" })).toHaveLength(1);
    expect(await screen.findByText("E001 · 员工甲 · 制造一部")).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/employee/home"));
  });

  it("认证后的产品壳子会把模块导航放在左侧而不是顶部", async () => {
    window.history.replaceState({}, "", "/employee/home");
    fetchMock.mockImplementation((input) => mockEmployeeAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findByRole("heading", { name: "管理人员首页概览" });

    const topNav = container.querySelector(".top-nav");
    const sideNav = container.querySelector(".app-sidebar");

    expect(topNav).not.toBeNull();
    expect(sideNav).not.toBeNull();
    expect(topNav?.querySelector('a[href="/employee/home"]')).toBeNull();
    expect(sideNav?.querySelector('a[href="/employee/home"]')).not.toBeNull();
  });

  it("认证后的产品壳子会让左侧菜单覆盖顶部条的左侧区域", async () => {
    window.history.replaceState({}, "", "/employee/home");
    fetchMock.mockImplementation((input) => mockEmployeeAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findByRole("heading", { name: "管理人员首页概览" });

    expect(container.querySelector(".app-layout > .app-sidebar")).not.toBeNull();
    expect(container.querySelector(".app-layout > .top-nav")).not.toBeNull();
    expect(container.querySelector(".app-layout > .app-main")).not.toBeNull();
  });

  it("已登录管理员可以挂载后台页面", async () => {
    window.history.replaceState({}, "", "/admin/accounts");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByRole("button", { name: "创建账号" })).toBeInTheDocument();
    expect(await screen.findAllByText("后台管理")).not.toHaveLength(0);
    expect(await screen.findAllByRole("button", { name: "退出登录" })).toHaveLength(1);
    expect(await screen.findByText("系统管理员")).toBeInTheDocument();
    expect(await screen.findByText("A001")).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/admin/accounts"));
  });

  it("禁用用户页会显示被禁用账号并支持解锁", async () => {
    window.history.replaceState({}, "", "/admin/disabled-users");
    fetchMock.mockImplementation((input, init) => mockAdminAppResponse(normalizePath(input), init));

    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "禁用用户" })).toBeInTheDocument();
    expect(screen.getByText("locked-user")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "解锁" }));
    expect(await screen.findByText("已解锁账号：locked-user")).toBeInTheDocument();
  });

  it("账套中心会挂载旧版账套工作台", async () => {
    window.history.replaceState({}, "", "/admin/dashboard");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByRole("button", { name: /账套设置/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /上传原始文档/ })).toBeInTheDocument();

    // 点击 ⚙️ 账套设置 打开弹窗
    fireEvent.click(screen.getByRole("button", { name: /账套设置/ }));
    expect(await screen.findByText("月度账套")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建" })).toBeInTheDocument();

    // 关闭账套设置弹窗
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(screen.queryByText("月度账套")).not.toBeInTheDocument());

    // 点击 📁 上传原始文档 打开弹窗
    fireEvent.click(screen.getByRole("button", { name: /上传原始文档/ }));
    expect(await screen.findByText("导入考勤原始表")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上传原始文件" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "员工计算" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "管理人员计算" })).toBeInTheDocument();

    // 关闭上传弹窗
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(screen.queryByText("导入考勤原始表")).not.toBeInTheDocument());

    expect(screen.getByText("账套导入记录")).toBeInTheDocument();
    expect(await screen.findByText(/请假单\.xlsx/)).toBeInTheDocument();
    expect(await screen.findByText("uploaded")).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/admin/dashboard"));
  });

  it("主数据员工页会挂载旧版新增、导入、筛选和列表结构", async () => {
    window.history.replaceState({}, "", "/admin/employees/manage");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    const { container } = render(<App />);

    expect(await screen.findByText("新增员工")).toBeInTheDocument();
    expect(screen.getByText("导入/导出员工")).toBeInTheDocument();
    expect(screen.getByText("员工筛选器")).toBeInTheDocument();
    expect(screen.getAllByText("人员编号").length).toBeGreaterThan(0);
    await waitFor(() => expect(container.querySelector("tbody")?.textContent).toContain("E001"));
  });

  it("员工管理页会在当前页异步上传 xlsx 并在成功后刷新列表", async () => {
    window.history.replaceState({}, "", "/admin/employees/manage");
    let employeeFetchCount = 0;
    fetchMock.mockImplementation((input, init) => {
      const path = normalizePath(input);
      if (path === "/api/admin/employees/import") {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBeInstanceOf(FormData);
        return Promise.resolve(jsonResponse({ status: "ok", imported: 3 }));
      }
      if (path === "/api/admin/employees") {
        employeeFetchCount += 1;
      }
      return mockAdminAppResponse(path);
    });

    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findByText("员工筛选器");
    const file = new File(["employee"], "employees.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const input = container.querySelector('input[type="file"][accept=".xlsx"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    expect(await screen.findByText("导入成功，处理 3 条")).toBeInTheDocument();
    await waitFor(() => expect(employeeFetchCount).toBeGreaterThanOrEqual(2));
    expect(window.location.pathname).toBe("/admin/employees/manage");
  });

  it("员工管理页导入失败时会原样展示后端错误", async () => {
    window.history.replaceState({}, "", "/admin/employees/manage");
    fetchMock.mockImplementation((input, init) => {
      const path = normalizePath(input);
      if (path === "/api/admin/employees/import") {
        expect(init?.body).toBeInstanceOf(FormData);
        return Promise.resolve(jsonResponse({ error: "第 2 行部门名称不存在" }, { status: 400 }));
      }
      return mockAdminAppResponse(path);
    });

    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findByText("员工筛选器");
    const file = new File(["employee"], "employees.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const input = container.querySelector('input[type="file"][accept=".xlsx"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    expect(await screen.findByText("第 2 行部门名称不存在")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/admin/employees/manage");
  });

  it("员工管理的员工筛选器按钮会打开选择器并回填员工", async () => {
    window.history.replaceState({}, "", "/admin/employees/manage");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findByText("员工筛选器");
    fireEvent.click(container.querySelector('button[title="选择员工"]') as Element);

    expect(await screen.findByRole("heading", { name: "选择员工" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /E001/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "确定" })[0]);

    expect(screen.getByPlaceholderText("搜索员工编号/姓名")).toHaveValue("员工甲");
  });

  it("员工管理的部门选择会复用旧版部门选择器结构", async () => {
    window.history.replaceState({}, "", "/admin/employees/manage");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findByText("员工筛选器");
    expect(container.querySelector("#createEmployeeDeptLookup.employee-lookup")).not.toBeNull();

    fireEvent.click(screen.getAllByTitle("选择部门")[0]);

    expect(await screen.findByRole("heading", { name: "选择部门" })).toBeInTheDocument();
    expect(screen.getByText("部门树")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "信息部" })[1]);
    fireEvent.click(screen.getAllByRole("button", { name: "确定" })[0]);

    expect(screen.getAllByDisplayValue("信息部").length).toBeGreaterThan(0);
  });

  it("员工管理表格会复用查询中心的分页表格结构", async () => {
    window.history.replaceState({}, "", "/admin/employees/manage");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findByText("员工筛选器");
    expect(container.querySelector(".legacy-table-wrap")).not.toBeNull();
    expect(container.querySelector(".table-pager select")).not.toBeNull();
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    expect(screen.getByText("第 1 / 1 页")).toBeInTheDocument();
  });

  it("主数据部门页会挂载旧版新增、导入、批量和列表结构", async () => {
    window.history.replaceState({}, "", "/admin/departments/manage");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    const { container } = render(<App />);

    expect(await screen.findByText("新建部门")).toBeInTheDocument();
    expect(screen.getByText("导入/导出部门")).toBeInTheDocument();
    expect(screen.getByText("部门列表")).toBeInTheDocument();
    expect(screen.getByText("一键删除空部门")).toBeInTheDocument();
    expect(screen.getByText("导出全部部门")).toBeInTheDocument();
    expect(screen.getAllByText("信息部").length).toBeGreaterThan(0);
    expect(container.querySelector(".table-pager select")).not.toBeNull();
    expect(screen.getByText("第 1 / 1 页")).toBeInTheDocument();
  });

  it("员工管理页会按当前筛选条件触发筛选导出", async () => {
    window.history.replaceState({}, "", "/admin/employees/manage");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    await screen.findByText("员工筛选器");
    const typeLabels = screen.getAllByText("人员类型");
    const typeSelect = typeLabels
      .map((node) => node.parentElement?.querySelector("select"))
      .find((node) => node != null);
    expect(typeSelect).not.toBeNull();
    fireEvent.change(typeSelect as HTMLSelectElement, { target: { value: "employee" } });

    fireEvent.click(screen.getByRole("button", { name: "导入/导出员工" }));
    expect(await screen.findByText("数据导入与导出")).toBeInTheDocument();

    // 默认在职状态筛选下，导出 URL 同时携带 status=active（仅导出在职员工）
    expect(screen.getByRole("link", { name: "导出当前筛选结果" })).toHaveAttribute(
      "href",
      "/api/admin/employees/export?status=active&type=employee",
    );
  });

  it("部门管理页会在当前页异步上传 xlsx 并在成功后刷新列表", async () => {
    window.history.replaceState({}, "", "/admin/departments/manage");
    let departmentFetchCount = 0;
    fetchMock.mockImplementation((input, init) => {
      const path = normalizePath(input);
      if (path === "/api/admin/departments/import") {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBeInstanceOf(FormData);
        return Promise.resolve(jsonResponse({ status: "ok", imported: 2 }));
      }
      if (path === "/api/admin/departments") {
        departmentFetchCount += 1;
      }
      return mockAdminAppResponse(path);
    });

    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findByText("部门列表");
    const file = new File(["dept"], "departments.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const input = container.querySelector('input[type="file"][accept=".xlsx"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    expect(await screen.findByText("导入成功，处理 2 条")).toBeInTheDocument();
    await waitFor(() => expect(departmentFetchCount).toBeGreaterThanOrEqual(2));
    expect(window.location.pathname).toBe("/admin/departments/manage");
  });

  it("部门管理页导入失败时会原样展示后端错误", async () => {
    window.history.replaceState({}, "", "/admin/departments/manage");
    fetchMock.mockImplementation((input, init) => {
      const path = normalizePath(input);
      if (path === "/api/admin/departments/import") {
        expect(init?.body).toBeInstanceOf(FormData);
        return Promise.resolve(jsonResponse({ error: "第 3 行部门编号重复" }, { status: 400 }));
      }
      return mockAdminAppResponse(path);
    });

    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findByText("部门列表");
    const file = new File(["dept"], "departments.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const input = container.querySelector('input[type="file"][accept=".xlsx"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    expect(await screen.findByText("第 3 行部门编号重复")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/admin/departments/manage");
  });

  it("部门管理的部门选择器按钮会打开部门树并回填上级部门", async () => {
    window.history.replaceState({}, "", "/admin/departments/manage");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    await screen.findByText("部门列表");
    fireEvent.click(screen.getAllByTitle("选择上级部门")[0]);

    expect(await screen.findByRole("heading", { name: "选择上级部门" })).toBeInTheDocument();
    expect(screen.getByText("部门树")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "信息部" })[1]);
    fireEvent.click(screen.getAllByRole("button", { name: "确定" })[0]);

    expect(screen.getAllByDisplayValue("信息部").length).toBeGreaterThan(0);
  });

  it("部门管理会按旧版使用 lookup 结构和批量更改上级部门弹窗", async () => {
    window.history.replaceState({}, "", "/admin/departments/manage");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findByText("部门列表");
    expect(container.querySelector("#createDeptParentLookup.employee-lookup")).not.toBeNull();

    fireEvent.click(container.querySelector('tbody input[type="checkbox"]') as Element);
    fireEvent.change(screen.getByDisplayValue("批量操作"), { target: { value: "set_parent" } });
    fireEvent.click(screen.getByRole("button", { name: "执行" }));

    expect(await screen.findByRole("heading", { name: "批量更改上级部门" })).toBeInTheDocument();
    expect(screen.getByText("将应用到已选 1 个部门。")).toBeInTheDocument();
    expect(container.querySelector("#batchDeptParentLookup.employee-lookup")).not.toBeNull();
  });

  it("部门管理的上级部门输入框支持搜索下拉联想", async () => {
    window.history.replaceState({}, "", "/admin/departments/manage");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    const input = await screen.findByPlaceholderText("选择上级部门");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "信息" } });

    expect(screen.getByRole("button", { name: "信息部" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "信息部" }));

    expect(screen.getByDisplayValue("信息部")).toBeInTheDocument();
  });

  it("主数据班次页会挂载旧版新增时间段和班次列表结构", async () => {
    window.history.replaceState({}, "", "/admin/shifts/manage");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByText("新增班次")).toBeInTheDocument();
    expect(screen.getByText("+ 新增时间段")).toBeInTheDocument();
    expect(screen.getByText("班次列表")).toBeInTheDocument();
    expect(screen.getByText("排班规则")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建班次" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新" })).toBeInTheDocument();
    expect(screen.getAllByText("班次编号").length).toBeGreaterThan(0);
    expect(screen.getByText("跨天")).toBeInTheDocument();
    expect(await screen.findByText("A班")).toBeInTheDocument();
    expect(screen.getByText("08:00-17:00")).toBeInTheDocument();
  });

  it("汇总下载页会挂载旧版多分区结构", async () => {
    window.history.replaceState({}, "", "/employee/summary-download");
    fetchMock.mockImplementation((input) => mockEmployeeAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "汇总下载" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /选择员工/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "自定义表头" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "下载说明" })).toBeInTheDocument();
    expect(await screen.findAllByText("考勤数据查询工作表")).not.toHaveLength(0);
    expect(screen.queryByRole("listbox")).toBeNull();
    await waitFor(() => expect(window.location.pathname).toBe("/employee/summary-download"));
  });

  it("员工考勤数据查询页会挂载旧版筛选栏和结果面板", async () => {
    window.history.replaceState({}, "", "/employee/dashboard");
    fetchMock.mockImplementation((input) => mockEmployeeAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "查询条件" })).toBeInTheDocument();
    expect(screen.getByText("按员工范围、账套和显示列模式组合查询。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    expect(await screen.findByText("共 1 条记录")).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/employee/dashboard"));
  });

  it("只有员工考勤权限时点击考勤天数会弹出原始刷卡记录", async () => {
    window.history.replaceState({}, "", "/employee/dashboard");
    fetchMock.mockImplementation((input) => mockDashboardOnlyEmployeeAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "查询" }));

    expect(await screen.findByRole("button", { name: "查看员工甲在 2026-05 的原始刷卡记录" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看员工甲在 2026-05 的原始刷卡记录" }));

    await waitFor(() => expect(hasRequestedPath("/api/query/punch-records")).toBe(true));
    expect(await screen.findByRole("heading", { name: "员工甲 2026-05 原始刷卡记录" })).toBeInTheDocument();
    expect(await screen.findByText("08:00,17:30")).toBeInTheDocument();
    expect(screen.getByText("部门")).toBeInTheDocument();
    expect(screen.getByText("姓名")).toBeInTheDocument();
    expect(screen.getByText("日期")).toBeInTheDocument();
    expect(screen.getByText("原始打卡数据")).toBeInTheDocument();
    expect(screen.queryByText("异常原因")).toBeNull();
    expect(screen.queryByText("打卡次数")).toBeNull();
    expect(screen.queryByText("实出勤小时")).toBeNull();
    const dialog = screen.getByRole("dialog", { name: "查询详情" });
    expect(within(dialog).getByRole("button", { name: "下载XLSX" })).toBeInTheDocument();
  });

  it("员工考勤数据查询页点击请假列会弹出对应请假明细", async () => {
    window.history.replaceState({}, "", "/employee/dashboard");
    fetchMock.mockImplementation((input) => mockEmployeeAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "查询" }));

    const leaveButtons = await screen.findAllByRole("button", { name: "查看员工甲在 2026-05 的病假明细" });
    expect(leaveButtons.length).toBeGreaterThan(0);

    fireEvent.click(leaveButtons[0]);

    expect(await screen.findByRole("heading", { name: "员工甲 2026-05 病假明细" })).toBeInTheDocument();
    expect(screen.getByText("请假类型")).toBeInTheDocument();
    expect(screen.getByText("开始时间")).toBeInTheDocument();
    expect(screen.getByText("结束时间")).toBeInTheDocument();
    expect(screen.getByText("时长")).toBeInTheDocument();
    expect(screen.getByText("事由")).toBeInTheDocument();
    expect(screen.getByText("发烧")).toBeInTheDocument();
    expect(screen.getByText("病假")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "查询详情" });
    expect(within(dialog).getByRole("button", { name: "下载XLSX" })).toBeInTheDocument();
  });

  it("员工异常查询页会严格复用员工考勤数据查询的筛选与结果结构", async () => {
    window.history.replaceState({}, "", "/employee/abnormal-query");
    fetchMock.mockImplementation((input) => mockEmployeeAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "查询条件" })).toBeInTheDocument();
    expect(screen.getByText("按员工范围和账套查询异常考勤汇总。")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    const abnormalOptionsField = screen.getByText("显示选项").closest("div");
    fireEvent.click(within(abnormalOptionsField as HTMLElement).getByRole("button"));
    expect(screen.getByRole("checkbox", { name: "人员编号" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    expect(await screen.findByText("共 1 条记录")).toBeInTheDocument();
    expect(screen.getByText("异常考勤次数")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();

    // fireEvent.click 不派发 mousedown，浮层不会被"查询"点击关闭，仍处于展开状态
    fireEvent.click(screen.getByRole("checkbox", { name: "人员编号" }));
    // 取消唯一选项后摘要变为"未选择"，表格列头按钮也随查询条件消失
    expect(screen.queryByRole("button", { name: "人员编号" })).toBeNull();
    expect(screen.getByText("异常考勤次数")).toBeInTheDocument();

    await waitFor(() => expect(window.location.pathname).toBe("/employee/abnormal-query"));
  });

  it("员工异常查询页点击异常考勤次数会弹出异常打卡时间", async () => {
    window.history.replaceState({}, "", "/employee/abnormal-query");
    fetchMock.mockImplementation((input) => mockEmployeeAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "查询" }));

    expect(await screen.findByRole("button", { name: "查看员工甲在 2026-05 的异常打卡时间" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看员工甲在 2026-05 的异常打卡时间" }));

    expect(await screen.findByRole("heading", { name: "员工甲 2026-05 异常打卡时间" })).toBeInTheDocument();
    expect(screen.getByText("序号")).toBeInTheDocument();
    expect(screen.getByText("部门")).toBeInTheDocument();
    expect(screen.getByText("姓名")).toBeInTheDocument();
    expect(screen.getByText("日期")).toBeInTheDocument();
    expect(screen.getByText("原始打卡数据")).toBeInTheDocument();
    expect(screen.getByText("2026-05-03")).toBeInTheDocument();
    expect(screen.getByText("08:01")).toBeInTheDocument();
    expect(screen.queryByText("2026-05-04")).toBeNull();
    expect(screen.queryByText("09:00,18:00")).toBeNull();
  });

  it("员工打卡数据查询页会挂载统一双栏结构并保留打卡显示选项", async () => {
    window.history.replaceState({}, "", "/employee/punch-records");
    fetchMock.mockImplementation((input) => mockEmployeeAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "查询条件" })).toBeInTheDocument();
    expect(screen.getByText("查询员工逐日打卡明细，并支持直接导出 Excel。")).toBeInTheDocument();
    const punchOptionsField = screen.getByText("显示选项").closest("div");
    fireEvent.click(within(punchOptionsField as HTMLElement).getByRole("button"));
    expect(screen.getByRole("checkbox", { name: "原始刷卡" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "上下班打卡" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    expect(await screen.findByText("原始打卡数据")).toBeInTheDocument();
    expect(screen.getByText("异常原因")).toBeInTheDocument();
    expect(screen.getByText("共 3 条记录")).toBeInTheDocument();
  });

  it("员工部门工时页会挂载统一双栏结构", async () => {
    window.history.replaceState({}, "", "/employee/department-hours-query");
    fetchMock.mockImplementation((input) => mockEmployeeAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "查询条件" })).toBeInTheDocument();
    expect(screen.getByText("按账套查看员工部门维度的工时汇总。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    expect(await screen.findByText("部门名称")).toBeInTheDocument();
    expect(screen.getByText("总工时（小时）")).toBeInTheDocument();
    expect(screen.getByText("160")).toBeInTheDocument();
  });

  it("管理人员考勤数据查询页会挂载统一双栏结构并保留模板导出入口", async () => {
    window.history.replaceState({}, "", "/employee/manager-query");
    fetchMock.mockImplementation((input) => mockEmployeeAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "查询条件" })).toBeInTheDocument();
    expect(screen.getByText("查询管理人员月度考勤结果，并支持模板导出。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "按模板导出" })).toBeInTheDocument();
    const managerOptionsField = screen.getByText("显示选项").closest("div");
    fireEvent.click(within(managerOptionsField as HTMLElement).getByRole("button"));
    expect(screen.getByRole("checkbox", { name: "显示实际出勤天数" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    expect(await screen.findByText("姓名")).toBeInTheDocument();
    expect(screen.getByText("共 1 条记录")).toBeInTheDocument();
  });

  it("管理人员考勤数据查询页点击关键字段会弹出对应明细", async () => {
    window.history.replaceState({}, "", "/employee/manager-query");
    fetchMock.mockImplementation((input) => mockEmployeeAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "查询" }));

    fireEvent.click((await screen.findAllByRole("button", { name: "查看经理甲在 2026-05 的出勤打卡明细" }))[0]);
    expect(await screen.findByRole("heading", { name: "经理甲 2026-05 出勤打卡明细" })).toBeInTheDocument();
    const attendanceDialog = screen.getByRole("dialog", { name: "查询详情" });
    expect(within(attendanceDialog).getByText("部门")).toBeInTheDocument();
    expect(within(attendanceDialog).getByText("姓名")).toBeInTheDocument();
    expect(within(attendanceDialog).getByText("原始打卡数据")).toBeInTheDocument();
    expect(within(attendanceDialog).getByText("08:00,12:00,13:00")).toBeInTheDocument();
    expect(within(attendanceDialog).getByText("日期")).toBeInTheDocument();
    expect(within(attendanceDialog).getByText("2026-05-01")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    fireEvent.click((await screen.findAllByRole("button", { name: "查看经理甲在 2026-05 的请假明细" }))[0]);
    expect(await screen.findByRole("heading", { name: "经理甲 2026-05 请假明细" })).toBeInTheDocument();
    const leaveDialog = screen.getByRole("dialog", { name: "查询详情" });
    expect(within(leaveDialog).getByText("请假类型")).toBeInTheDocument();
    expect(within(leaveDialog).getByText("婚假")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    fireEvent.click(await screen.findByRole("button", { name: "查看经理甲在 2026-05 的迟到明细" }));
    expect(await screen.findByRole("heading", { name: "经理甲 2026-05 迟到明细" })).toBeInTheDocument();
    const lateDialog = screen.getByRole("dialog", { name: "查询详情" });
    expect(within(lateDialog).getByText("迟到分钟")).toBeInTheDocument();
    expect(within(lateDialog).queryByText("早退分钟")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    fireEvent.click(await screen.findByRole("button", { name: "查看经理甲在 2026-05 的福利天数说明" }));
    expect(await screen.findByRole("heading", { name: "经理甲 2026-05 福利天数说明" })).toBeInTheDocument();
    expect(within(screen.getByRole("dialog", { name: "查询详情" })).getByText((content) => content.includes("本月福利天数"))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    fireEvent.click(await screen.findByRole("button", { name: "查看经理甲在 2026-05 的加班变化说明" }));
    expect(await screen.findByRole("heading", { name: "经理甲 2026-05 加班变化说明" })).toBeInTheDocument();
    expect(within(screen.getByRole("dialog", { name: "查询详情" })).getByText((content) => content.includes("本月加班变化"))).toBeInTheDocument();
  });

  it("管理人员加班查询页会挂载统一双栏结构", async () => {
    window.history.replaceState({}, "", "/employee/manager-overtime-query");
    fetchMock.mockImplementation((input) => mockEmployeeAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "查询条件" })).toBeInTheDocument();
    expect(screen.getByText("按年份查询管理人员月度加班统计。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    expect(await screen.findByText("前年累积天数")).toBeInTheDocument();
    expect(screen.getByText("部门")).toBeInTheDocument();
    expect(screen.getByText("经理甲")).toBeInTheDocument();
    expect(screen.getByText("共 1 条记录")).toBeInTheDocument();
  });

  it("管理人员年休查询页会挂载统一双栏结构", async () => {
    window.history.replaceState({}, "", "/employee/manager-annual-leave-query");
    fetchMock.mockImplementation((input) => mockEmployeeAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "查询条件" })).toBeInTheDocument();
    expect(screen.getByText("按年份查询管理人员月度年休统计。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    expect(await screen.findByText("剩余年休天数")).toBeInTheDocument();
    expect(screen.getByText("姓名")).toBeInTheDocument();
    expect(screen.getByText("经理甲")).toBeInTheDocument();
    expect(screen.getByText("共 1 条记录")).toBeInTheDocument();
  });

  it("管理人员部门工时页会挂载统一双栏结构", async () => {
    window.history.replaceState({}, "", "/employee/manager-department-hours-query");
    fetchMock.mockImplementation((input) => mockEmployeeAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "查询条件" })).toBeInTheDocument();
    expect(screen.getByText("按账套统计管理人员部门维度工时。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    expect(await screen.findByText("部门名称")).toBeInTheDocument();
    expect(screen.getByText("总工时（小时）")).toBeInTheDocument();
    expect(screen.getByText("72")).toBeInTheDocument();
  });

  it("页签切换后会保留员工考勤查询状态", async () => {
    window.history.replaceState({}, "", "/employee/dashboard");
    fetchMock.mockImplementation((input) => mockEmployeeAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    await screen.findByRole("heading", { name: "查询条件" });
    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    expect(await screen.findByText("共 1 条记录")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("link", { name: /汇总下载/i })[0]);
    expect(await screen.findByRole("heading", { name: "汇总下载" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "员工考勤数据查询" }));

    expect(await screen.findByText("共 1 条记录")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "员工考勤数据查询" })).toHaveAttribute("aria-selected", "true");
  });

  it("管理人员考勤查询页不再显示顶部说明卡片", async () => {
    window.history.replaceState({}, "", "/employee/manager-query");
    fetchMock.mockImplementation((input) => mockEmployeeAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    const { container } = render(<App />);

    expect(await screen.findByRole("heading", { name: "查询条件" })).toBeInTheDocument();
    expect(container.querySelector(".legacy-page-header")).toBeNull();
    expect(screen.getByText("查询管理人员月度考勤结果，并支持模板导出。")).toBeInTheDocument();
    expect(container.querySelector(".legacy-table-wrap")).not.toBeNull();
    await waitFor(() => expect(window.location.pathname).toBe("/employee/manager-query"));
  });

  it("管理人员考勤修正页不会在缺少查询条件时首屏加载失败", async () => {
    window.history.replaceState({}, "", "/admin/manager-attendance-overrides");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByText("查询条件")).toBeInTheDocument();
    expect(await screen.findAllByText("请先查询管理人员和月份")).not.toHaveLength(0);
    expect(screen.queryByText("管理人员考勤修正加载失败")).not.toBeInTheDocument();
    expect(hasRequestedPath("/api/admin/manager-attendance-overrides")).toBe(false);
  });

  it("员工考勤修正页会挂载查询操作区和列表区", async () => {
    window.history.replaceState({}, "", "/admin/employee-attendance-overrides");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByText("查询条件")).toBeInTheDocument();
    expect(screen.getByText("主要操作")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查询" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导入导出" })).toBeInTheDocument();
    expect(screen.queryByText("Query Filters")).not.toBeInTheDocument();
    expect(screen.queryByText("选择人员和月份后维护手工修正值")).not.toBeInTheDocument();
    expect(screen.getByText("请先查询员工和月份")).toBeInTheDocument();
  });

  it("员工无月度修正时日历弹窗不显示月度修正优先提示", async () => {
    window.history.replaceState({}, "", "/admin/employee-attendance-overrides");
    fetchMock.mockImplementation((input) => {
      const path = normalizePath(input);
      if (path === "/api/admin/employee-attendance-overrides") {
        // 后端无月度修正时 override 为全空字段对象（非 null）
        return Promise.resolve(
          jsonResponse({
            month: "2026-05",
            rows: [
              {
                employee: { id: 12, emp_no: "E001", name: "员工甲", dept_id: 10, dept_name: "信息部", is_manager: false },
                automatic: { attendance_days: 21, work_hours: 168, half_days: 0, late_early_minutes: 0 },
                override: {
                  attendance_days: null,
                  actual_attendance_days: null,
                  work_hours: null,
                  half_days: null,
                  late_early_minutes: null,
                  remark: "",
                  updated_at: null,
                  updated_by_name: "",
                },
                applied: { attendance_days: 21, work_hours: 168, half_days: 0, late_early_minutes: 0 },
              },
            ],
          }),
        );
      }
      return mockAdminAppResponse(path);
    });

    const { default: App } = await import("./App");
    render(<App />);

    await screen.findByText("查询条件");
    fireEvent.click(screen.getByRole("button", { name: "查询" }));
    expect(await screen.findByText("员工甲")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    expect(await screen.findByText("编辑员工考勤修正")).toBeInTheDocument();
    expect(await screen.findByText(/出勤 1 天/)).toBeInTheDocument();
    expect(screen.queryByText(/最终应用值以月度修正为准/)).not.toBeInTheDocument();
  });

  it("考勤修正页会挂载专用查询卡和员工选择器样式类", async () => {
    window.history.replaceState({}, "", "/admin/employee-attendance-overrides");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findByText("查询条件");
    expect(container.querySelector(".query-filter-rail")).not.toBeNull();
    expect(container.querySelector(".query-filter-rail .query-filter-body")).not.toBeNull();
    expect(container.querySelector(".query-filter-field .employee-float-list")).not.toBeNull();
  });

  it("管理人员考勤修正页选择月份和人员后可以查询", async () => {
    window.history.replaceState({}, "", "/admin/manager-attendance-overrides");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    await screen.findByText("查询条件");
    fireEvent.click(screen.getByRole("button", { name: "选择管理人员" }));
    fireEvent.click(screen.getByLabelText("M001 - 经理甲"));
    fireEvent.click(screen.getAllByRole("button", { name: "确定" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    expect(await screen.findByText("M001")).toBeInTheDocument();
    expect(await screen.findByText("经理甲")).toBeInTheDocument();
    expect(await screen.findByText("出勤天数：20")).toBeInTheDocument();
    expect(await screen.findByText("经理修正")).toBeInTheDocument();
    expect(document.querySelector(".table-pager select")).not.toBeNull();
    expect(screen.getByText("第 1 / 1 页")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    expect(await screen.findByText("编辑管理人员考勤修正")).toBeInTheDocument();
    expect(await screen.findByText(/出勤 1 天/)).toBeInTheDocument();
    expect(screen.getByText("周一")).toBeInTheDocument();
    expect(screen.getByText(/最终应用值以月度修正为准/)).toBeInTheDocument();
  });

  it("迟到冲抵页展示候选并支持确认操作", async () => {
    window.history.replaceState({}, "", "/admin/late-offset");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByText("查询条件")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择管理人员" })).toBeInTheDocument();
    const accountSelect = screen.getByRole("combobox") as HTMLSelectElement;
    expect(accountSelect.value).toBe("2026-05");
    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    expect(await screen.findAllByText("M001")).toHaveLength(2);
    expect(await screen.findAllByText("经理甲")).toHaveLength(2);
    expect(await screen.findByText("2026-05-12")).toBeInTheDocument();
    expect(await screen.findByText("20")).toBeInTheDocument();
    expect(await screen.findAllByText("0")).toHaveLength(2);
    expect(screen.queryByText("人员类型")).not.toBeInTheDocument();
    expect(screen.queryByText("选择")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    const selectAll = screen.getByLabelText("全选") as HTMLInputElement;
    expect(selectAll.checked).toBe(false);
    fireEvent.click(selectAll);
    expect(selectAll.checked).toBe(true);
    expect((screen.getByLabelText("选择 经理甲 2026-05-12") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("button", { name: "确认冲抵(1)" })).toBeInTheDocument();
    expect(screen.getByLabelText("编辑冲抵分钟 经理甲 2026-05-12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认冲抵" })).toBeInTheDocument();
    expect(await screen.findByText("2026-05-13")).toBeInTheDocument();
    expect(screen.getByText("30（已冲抵）")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "清除冲抵" })).toBeInTheDocument();
    const confirmedCheck = screen.getByLabelText("选择 经理甲 2026-05-13") as HTMLInputElement;
    expect(confirmedCheck.disabled).toBe(true);

    fireEvent.click(screen.getAllByRole("button", { name: "请假记录" })[0]);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText("L2026001")).toBeInTheDocument();
    expect(screen.getByText("年假")).toBeInTheDocument();
    expect(screen.getByText("2026-05-12 08:40")).toBeInTheDocument();
    expect(screen.getByText("迟到冲抵20分钟")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("管理人员加班后台页会挂载旧版查询区和编辑弹窗工作流", async () => {
    window.history.replaceState({}, "", "/admin/manager-overtime");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    const { container } = render(<App />);

    expect(await screen.findByText("查询条件")).toBeInTheDocument();
    expect(screen.getByText("管理人员")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查询" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导入导出" })).toBeInTheDocument();
    expect(screen.queryByText("Query Filters")).not.toBeInTheDocument();
    expect(screen.queryByText("按年度和人员筛选后查看列表，通过弹窗维护单人整年数据")).not.toBeInTheDocument();
    expect(screen.getByText("请先查询管理人员和年份")).toBeInTheDocument();
    expect(container.querySelector(".table-pager")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "选择管理人员" }));
    fireEvent.click(screen.getByLabelText("M001 - 经理甲"));
    fireEvent.click(screen.getAllByRole("button", { name: "确定" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    expect(await screen.findByText("前年累积")).toBeInTheDocument();
    expect(screen.getByText("剩余调休天数")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
    expect(await screen.findByText("编辑管理人员加班")).toBeInTheDocument();
    expect(screen.getByText("前年累积天数")).toBeInTheDocument();
    expect(screen.getByText("1月")).toBeInTheDocument();
  });

  it("管理人员年休后台页会挂载旧版查询区和编辑弹窗工作流", async () => {
    window.history.replaceState({}, "", "/admin/manager-annual-leave");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    const { container } = render(<App />);

    expect(await screen.findByText("查询条件")).toBeInTheDocument();
    expect(screen.getByText("管理人员")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查询" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导入导出" })).toBeInTheDocument();
    expect(screen.queryByText("Query Filters")).not.toBeInTheDocument();
    expect(screen.queryByText("按年度和人员筛选后查看列表，通过弹窗维护单人整年数据")).not.toBeInTheDocument();
    expect(screen.getByText("请先查询管理人员和年份")).toBeInTheDocument();
    expect(container.querySelector(".table-pager")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "选择管理人员" }));
    fireEvent.click(screen.getByLabelText("M001 - 经理甲"));
    fireEvent.click(screen.getAllByRole("button", { name: "确定" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    expect(await screen.findByText("年度已用")).toBeInTheDocument();
    expect(screen.getByText("剩余年休天数")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
    expect(await screen.findByText("编辑管理人员年休")).toBeInTheDocument();
    expect(screen.getByText("1月")).toBeInTheDocument();
    expect(screen.getByText("12月")).toBeInTheDocument();
  });

  it("账号管理页会挂载旧版创建区和批量操作区", async () => {
    window.history.replaceState({}, "", "/admin/accounts");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByRole("button", { name: "创建账号" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "一键创建管理人员账号" })).toBeInTheDocument();
    expect(screen.getByText("账号列表")).toBeInTheDocument();
    expect(screen.queryByText(/当前显示 .* 个账号/)).toBeNull();
    expect(screen.getByRole("button", { name: "清空筛选" })).toBeInTheDocument();
    expect((await screen.findAllByText("admin")).length).toBeGreaterThan(1);
    expect(screen.queryByText("暂无账号数据")).toBeNull();
    expect(screen.queryByRole("button", { name: "重置密码" })).toBeNull();

    fireEvent.click(screen.getAllByLabelText("选择账号行")[0]);
    expect(screen.getByRole("button", { name: "修改角色" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关联员工" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关联部门" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "页面权限" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重置密码" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除账号" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "创建账号" }));
    expect(await screen.findByText("关联员工 (限定可见个人数据)")).toBeInTheDocument();
    expect(screen.getByText("关联部门 (限定可见部门数据)")).toBeInTheDocument();
    expect(screen.getByText("功能导航权限")).toBeInTheDocument();
  });

  it("账号管理页可以打开编辑账号弹窗", async () => {
    window.history.replaceState({}, "", "/admin/accounts");
    fetchMock.mockImplementation((input) => mockAdminAppResponse(normalizePath(input)));

    const { default: App } = await import("./App");
    render(<App />);

    await screen.findByRole("button", { name: "创建账号" });
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    expect(await screen.findByText("编辑账号")).toBeInTheDocument();
    expect(screen.getByText("绑定档案人员 (自动提取工号/姓名/部门)")).toBeInTheDocument();
    expect(screen.getByText("关联员工 (限定可见个人数据)")).toBeInTheDocument();
    expect(screen.getByText("关联部门 (限定可见部门数据)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重置密码" })).toBeInTheDocument();
  });



});

function normalizePath(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return new URL(input, "http://localhost").pathname;
  }
  if (input instanceof URL) {
    return input.pathname;
  }
  return new URL(input.url, "http://localhost").pathname;
}

// 滑块组件默认折叠，需先点击触发按钮展开，再拖动滑块完成验证。
async function completeSliderCaptcha() {
  fireEvent.click(await screen.findByRole("button", { name: "点击进行安全验证" }));
  await screen.findByAltText("验证码背景");
  const sliderHandle = screen.getByRole("button", { name: "拖动滑块" });
  fireEvent.pointerDown(sliderHandle, { clientX: 10, pointerId: 1 });
  fireEvent.pointerMove(sliderHandle, { clientX: 160, pointerId: 1 });
  fireEvent.pointerUp(sliderHandle, { clientX: 160, pointerId: 1 });
  await screen.findByText("验证通过");
}

function hasRequestedPath(pathname: string): boolean {
  return fetchMock.mock.calls.some(([input]) => normalizePath(input) === pathname);
}

function mockDashboardOnlyEmployeeAppResponse(path: string): Promise<Response> {
  if (path === "/api/query/navigation") {
    return Promise.resolve(
      jsonResponse({
        modules: [
          {
            slug: "query",
            label: "查询中心",
            short_label: "查询",
            home_href: "/employee/home",
            entries: [
              {
                key: "employee_home",
                label: "首页",
                href: "/employee/home",
              },
              {
                key: "employee_dashboard",
                label: "员工考勤数据查询",
                href: "/employee/dashboard",
              },
            ],
          },
        ],
      }),
    );
  }

  return mockEmployeeAppResponse(path);
}

function mockEmployeeAppResponse(path: string): Promise<Response> {
  switch (path) {
    case "/api/auth/me":
      return Promise.resolve(
        jsonResponse({
          id: 1,
          username: "viewer",
          role: "readonly",
          page_permissions: { employee_dashboard: true },
        }),
      );
    case "/api/query/navigation":
      return Promise.resolve(
        jsonResponse({
          modules: [
            {
              slug: "query",
              label: "查询中心",
              short_label: "查询",
              home_href: "/employee/home",
              entries: [
                {
                  key: "employee_home",
                  label: "首页",
                  href: "/employee/home",
                },
                {
                  key: "employee_dashboard",
                  label: "员工考勤数据查询",
                  href: "/employee/dashboard",
                },
                {
                  key: "employee_abnormal_query",
                  label: "员工异常查询",
                  href: "/employee/abnormal-query",
                },
                {
                  key: "punch_records",
                  label: "员工打卡数据查询",
                  href: "/employee/punch-records",
                },
                {
                  key: "department_hours_query",
                  label: "员工部门工时",
                  href: "/employee/department-hours-query",
                },
                {
                  key: "manager_query",
                  label: "管理人员考勤数据查询",
                  href: "/employee/manager-query",
                },
                {
                  key: "manager_overtime_query",
                  label: "管理人员加班查询",
                  href: "/employee/manager-overtime-query",
                },
                {
                  key: "manager_annual_leave_query",
                  label: "管理人员年休查询",
                  href: "/employee/manager-annual-leave-query",
                },
                {
                  key: "manager_department_hours_query",
                  label: "管理人员部门工时",
                  href: "/employee/manager-department-hours-query",
                },
                {
                  key: "summary_download",
                  label: "汇总下载",
                  href: "/employee/summary-download",
                },
              ],
            },
          ],
        }),
      );
    case "/api/query/bootstrap":
      return Promise.resolve(
        jsonResponse({
          employees: [
            {
              id: 1,
              emp_no: "E001",
              name: "员工甲",
              dept_id: 10,
              dept_name: "制造一部",
              is_manager: false,
            },
            {
              id: 3,
              emp_no: "M001",
              name: "经理甲",
              dept_id: 10,
              dept_name: "制造一部",
              is_manager: true,
            },
          ],
          account_sets: [
            {
              id: 1,
              month: "2026-05",
              name: "2026年5月",
              is_active: true,
            },
          ],
          departments: [
            {
              id: 10,
              dept_no: "D001",
              dept_name: "制造一部",
              parent_id: null,
            },
          ],
        }),
      );
    case "/api/query/home-summary":
      return Promise.resolve(
        jsonResponse({
          has_data: true,
          empty_state: "",
          month: "2026-05",
          account_set_name: "2026年5月",
          support_message: "已加载首页摘要",
          manager: {
            emp_no: "E001",
            name: "员工甲",
            dept_name: "制造一部",
          },
          summary: {
            attendance_days: 20,
          },
        }),
      );
    case "/api/query/employee-dashboard":
      return Promise.resolve(
        jsonResponse({
          headers: ["人员编号", "人员名称", "考勤天数", "病假（次数）", "病假时长（天）"],
          rows: [["E001", "员工甲", "20", "1", "1"]],
        }),
      );
    case "/api/query/abnormal":
      return Promise.resolve(
        jsonResponse([
          {
            dept_name: "制造一部",
            emp_no: "E001",
            name: "员工甲",
            abnormal_count: 3,
          },
        ]),
      );
    case "/api/query/punch-records":
      return Promise.resolve(
        jsonResponse([
          {
            date: "2026-05-01",
            emp_no: "E001",
            name: "员工甲",
            dept_name: "制造一部",
            raw_punch_data: "08:00,17:30",
            check_in_times: "08:00",
            check_out_times: "17:30",
            punch_count: 2,
            actual_hours: 8,
            late_minutes: 0,
            early_leave_minutes: 0,
            exception_reason: "",
          },
          {
            date: "2026-05-03",
            emp_no: "E001",
            name: "员工甲",
            dept_name: "制造一部",
            raw_punch_data: "08:01",
            check_in_times: "08:01",
            check_out_times: "",
            punch_count: 1,
            actual_hours: 0.5,
            late_minutes: 1,
            early_leave_minutes: 0,
            exception_reason: "缺卡",
          },
          {
            date: "2026-05-04",
            emp_no: "E001",
            name: "员工甲",
            dept_name: "制造一部",
            raw_punch_data: "09:00,18:00",
            check_in_times: "",
            check_out_times: "",
            punch_count: 2,
            actual_hours: 0,
            late_minutes: 0,
            early_leave_minutes: 0,
            exception_reason: "缺卡",
          },
        ]),
      );
    case "/api/query/leave-records":
      return Promise.resolve(
        jsonResponse([
          {
            dept_name: "制造一部",
            name: "员工甲",
            leave_type: "病假",
            start_time: "2026-05-02 09:00",
            end_time: "2026-05-03 09:00",
            duration: 1,
            reason: "发烧",
          },
        ]),
      );
    case "/api/query/department-hours":
      return Promise.resolve(
        jsonResponse([
          {
            dept_name: "制造一部",
            total_hours: 160,
          },
        ]),
      );
    case "/api/query/manager-attendance":
      return Promise.resolve(
        jsonResponse({
          headers: ["部   门", "姓名", "出勤天数", "实际出勤天数", "事/病假", "工伤", "出差", "婚假", "丧假", "迟到\\早退", "汇总", "福利天数", "加班变化", "备注"],
          rows: [["制造一部", "经理甲", "20", "18", "0", "0", "0", "1", "0", "5", "5元", "1", "-0.5", "迟到"]],
        }),
      );
    case "/api/query/manager-punch-records":
      return Promise.resolve(
        jsonResponse([
          {
            date: "2026-05-01",
            dept_name: "制造一部",
            name: "经理甲",
            raw_punch_data: "08:00,12:00,13:00",
            late_minutes: 5,
            early_leave_minutes: 0,
          },
        ]),
      );
    case "/api/query/manager-leave-records":
      return Promise.resolve(
        jsonResponse([
          {
            dept_name: "制造一部",
            name: "经理甲",
            leave_type: "婚假",
            start_time: "2026-05-02 09:00",
            end_time: "2026-05-03 09:00",
            duration: 1,
            reason: "结婚",
          },
        ]),
      );
    case "/api/query/manager-overtime":
      return Promise.resolve(
        jsonResponse({
          headers: ["部门", "姓名", "前年累积天数", "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "剩余调休天数", "备注"],
          rows: [
            {
              dept_name: "制造一部",
              name: "经理甲",
              prev_dec: "8",
              m1: "2",
              m2: "",
              m3: "",
              m4: "",
              m5: "",
              m6: "",
              m7: "",
              m8: "",
              m9: "",
              m10: "",
              m11: "",
              m12: "",
              remaining: "10",
              remark: "",
            },
          ],
        }),
      );
    case "/api/query/manager-annual-leave":
      return Promise.resolve(
        jsonResponse({
          headers: ["部门", "姓名", "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "剩余年休天数", "备注"],
          rows: [
            {
              dept_name: "制造一部",
              name: "经理甲",
              m1: "1",
              m2: "",
              m3: "",
              m4: "",
              m5: "",
              m6: "",
              m7: "",
              m8: "",
              m9: "",
              m10: "",
              m11: "",
              m12: "",
              remaining: "4",
              remark: "",
            },
          ],
        }),
      );
    case "/api/query/manager-department-hours":
      return Promise.resolve(
        jsonResponse([
          {
            dept_name: "制造一部",
            total_hours: 72,
          },
        ]),
      );
    default:
      throw new Error(`unexpected request: ${path}`);
  }
}

function mockAdminAppResponse(path: string, _init?: RequestInit): Promise<Response> {
  switch (path) {
    case "/api/auth/me":
      return Promise.resolve(
        jsonResponse({
          id: 9,
          username: "admin",
          role: "admin",
        }),
      );
    case "/api/query/navigation":
      return Promise.resolve(
        jsonResponse({
          modules: [
            {
              slug: "admin",
              label: "后台管理",
              short_label: "后台",
              home_href: "/admin/dashboard",
              entries: [
                {
                  key: "admin_dashboard",
                  label: "后台首页",
                  href: "/admin/dashboard",
                },
                {
                  key: "accounts",
                  label: "账号管理",
                  href: "/admin/accounts",
                },
                {
                  key: "disabled_users",
                  label: "禁用用户",
                  href: "/admin/disabled-users",
                },

                {
                  key: "employees",
                  label: "员工管理",
                  href: "/admin/employees/manage",
                },
                {
                  key: "departments",
                  label: "部门管理",
                  href: "/admin/departments/manage",
                },
                {
                  key: "shifts",
                  label: "班次管理",
                  href: "/admin/shifts/manage",
                },
              ],
            },
          ],
        }),
      );
    case "/api/admin/accounts":
      return Promise.resolve(
        jsonResponse([
          {
            id: 9,
            username: "admin",
            role: "admin",
            profile_emp_no: "A001",
            profile_name: "管理员",
            profile_dept_id: 10,
            profile_department: {
              id: 10,
              dept_no: "D001",
              dept_name: "信息部",
            },
            created_at: "2026-05-02T09:00:00",
            page_permissions: {
              query_home: true,
              manager_query: true,
              manager_overtime_query: true,
              manager_annual_leave_query: true,
              employee_dashboard: true,
              abnormal_query: true,
              punch_records: true,
              department_hours_query: true,
              summary_download: true,
            },
            emp_ids: [11],
            dept_ids: [10],
            employees: [{ id: 11, emp_no: "M001", name: "经理甲", dept_name: "信息部" }],
            departments: [{ id: 10, dept_name: "信息部" }],
          },
        ]),
      );
    case "/api/admin/disabled-users":
      return Promise.resolve(
        jsonResponse([
          {
            id: 21,
            username: "locked-user",
            role: "readonly",
            profile_emp_no: "E021",
            profile_name: "员工乙",
            login_failed_attempts: 10,
            login_locked_until: null,
            login_disabled_until_admin_unlock: true,
            login_disabled_reason: "too_many_failed_attempts",
          },
        ]),
      );
    case "/api/admin/disabled-users/21/unlock":
      return Promise.resolve(
        jsonResponse({
          status: "ok",
          user: {
            id: 21,
            username: "locked-user",
            role: "readonly",
            profile_emp_no: "E021",
            profile_name: "员工乙",
            login_failed_attempts: 0,
            login_locked_until: null,
            login_disabled_until_admin_unlock: false,
            login_disabled_reason: null,
          },
        }),
      );
    case "/api/admin/database-settings":
      return Promise.resolve(
        jsonResponse([
          {
            item: "数据库类型",
            value: "sqlite",
            description: "当前 SQLAlchemy 连接使用的数据库方言。",
          },
          {
            item: "数据库名称",
            value: "attendance.db",
            description: "当前应用实际连接的数据库名称或本地文件名。",
          },
          {
            item: "主机地址",
            value: "-",
            description: "远程数据库显示主机地址，本地 sqlite 显示为 - 。",
          },
          {
            item: "用户名",
            value: "-",
            description: "数据库连接用户名；未配置时显示为 - 。",
          },
        ]),
      );
    case "/api/admin/account-sets":
      return Promise.resolve(
        jsonResponse([
          {
            id: 1,
            month: "2026-05",
            name: "2026-05 账套",
            is_active: true,
            is_locked: false,
            locked_at: null,
            locked_by: null,
            factory_rest_days: 1.5,
            factory_rest_entries: [
              { date: "2026-05-01", period: "full", unit: 1 },
              { date: "2026-05-02", period: "am", unit: 0.5 },
            ],
            monthly_benefit_days: 2,
            created_at: "2026-05-01T08:00:00",
            imports_count: 1,
            pending_count: 1,
            success_count: 0,
            error_count: 0,
            latest_import_at: "2026-05-02T09:00:00",
          },
        ]),
      );
    case "/api/admin/account-sets/1/imports":
      return Promise.resolve(
        jsonResponse([
          {
            id: 1,
            source_filename: "请假单.xlsx",
            stored_path: "/tmp/leave.xlsx",
            file_type: "leave",
            status: "uploaded",
            imported_count: 0,
            error_message: null,
            created_at: "2026-05-02T09:00:00",
          },
        ]),
      );
    case "/api/admin/employees":
      return Promise.resolve(
        jsonResponse([
          {
            id: 12,
            emp_no: "E001",
            name: "员工甲",
            dept_id: 10,
            dept_name: "信息部",
            shift_no: "A",
            shift_name: "A班",
            is_manager: false,
            is_nursing: false,
            employee_stats_attendance_source: "employee",
            manager_stats_attendance_source: "manager",
          },
        ]),
      );
    case "/api/admin/departments":
      return Promise.resolve(
        jsonResponse([
          {
            id: 10,
            dept_no: "D001",
            dept_name: "信息部",
            parent_id: null,
            parent_name: "",
            is_locked: false,
          },
        ]),
      );
    case "/api/admin/shifts":
      return Promise.resolve(
        jsonResponse([
          {
            id: 1,
            shift_no: "A",
            shift_name: "A班",
            time_slots: [["08:00", "17:00"]],
            is_cross_day: false,
          },
        ]),
      );
    case "/api/query/bootstrap":
      return Promise.resolve(
        jsonResponse({
          employees: [
            {
              id: 11,
              emp_no: "M001",
              name: "经理甲",
              dept_id: 10,
              dept_name: "信息部",
              is_manager: true,
            },
            {
              id: 12,
              emp_no: "E001",
              name: "员工甲",
              dept_id: 10,
              dept_name: "信息部",
              is_manager: false,
            },
          ],
          account_sets: [
            {
              id: 1,
              month: "2026-05",
              name: "2026年5月",
              is_active: true,
            },
          ],
          departments: [
            {
              id: 10,
              dept_no: "D001",
              dept_name: "信息部",
              parent_id: null,
            },
          ],
        }),
      );
    case "/api/admin/manager-attendance-overrides":
      return Promise.resolve(
        jsonResponse({
          month: "2026-05",
          rows: [
            {
              employee: {
                id: 11,
                emp_no: "M001",
                name: "经理甲",
                dept_id: 10,
                dept_name: "信息部",
                is_manager: true,
              },
              automatic: {
                attendance_days: 20,
                injury_days: null,
                business_trip_days: null,
                marriage_days: null,
                funeral_days: null,
                late_early_minutes: null,
              },
              override: {
                attendance_days: 20,
                injury_days: 1,
                business_trip_days: null,
                marriage_days: null,
                funeral_days: null,
                late_early_minutes: 5,
                remark: "经理修正",
                updated_at: "2026-05-10T09:00:00",
              },
              applied: {
                attendance_days: 20,
                injury_days: 1,
                business_trip_days: null,
                marriage_days: null,
                funeral_days: null,
                late_early_minutes: 5,
              },
            },
          ],
        }),
      );
    case "/api/admin/attendance-override-daily/calendar":
      return Promise.resolve(
        jsonResponse({
          employee: { id: 11, emp_no: "M001", name: "经理甲", dept_name: "信息部" },
          month: "2026-05",
          days: [
            {
              date: "2026-05-06",
              check_in_times: ["08:00"],
              check_out_times: ["17:00"],
              punch_count: 2,
              actual_hours: 8,
              late_minutes: 0,
              early_leave_minutes: 0,
              is_half_day: false,
              exception_reason: "",
              override: null,
            },
          ],
          overtimes: [],
          leaves: [],
          summary: {
            attendance_days: 1,
            half_days: 0,
            leave_by_type: [],
            evening_overtime_hours: 0,
            other_overtime_hours: 0,
            late_minutes_total: 0,
            early_leave_minutes_total: 0,
          },
        }),
      );
    case "/api/admin/manager-overtime/records":
      return Promise.resolve(
        jsonResponse([
          {
            emp_id: 11,
            dept_name: "信息部",
            name: "经理甲",
            prev_dec: 8,
            m1: 2,
            m2: 0,
            m3: 0,
            m4: 0,
            m5: 0,
            m6: 0,
            m7: 0,
            m8: 0,
            m9: 0,
            m10: 0,
            m11: 0,
            m12: 0,
            remaining: 10,
            remark: "",
          },
        ]),
      );
    case "/api/admin/manager-annual-leave/records":
      return Promise.resolve(
        jsonResponse([
          {
            emp_id: 11,
            dept_name: "信息部",
            name: "经理甲",
            m1: 1,
            m2: 0,
            m3: 0,
            m4: 0,
            m5: 0,
            m6: 0,
            m7: 0,
            m8: 0,
            m9: 0,
            m10: 0,
            m11: 0,
            m12: 0,
            remaining: 4,
            remark: "",
          },
        ]),
      );
    case "/api/admin/employee-attendance-overrides":
      return Promise.resolve(
        jsonResponse({
          month: "2026-05",
          rows: [
            {
              employee: {
                id: 12,
                emp_no: "E001",
                name: "员工甲",
                dept_id: 10,
                dept_name: "信息部",
                is_manager: false,
              },
              automatic: {
                attendance_days: 21,
                work_hours: 168,
                half_days: 0,
                late_early_minutes: 0,
              },
              override: {
                attendance_days: 20,
                work_hours: 160,
                half_days: 1,
                late_early_minutes: 10,
                remark: "员工修正",
                updated_at: "2026-05-11T09:30:00",
              },
              applied: {
                attendance_days: 20,
                work_hours: 160,
                half_days: 1,
                late_early_minutes: 10,
              },
            },
          ],
        }),
      );
    case "/api/admin/late-offset/candidates":
      return Promise.resolve(
        jsonResponse({
          month: "2026-05",
          rows: [
            {
              emp_id: 11,
              emp_no: "M001",
              emp_name: "经理甲",
              dept_name: "信息部",
              is_manager: true,
              date: "2026-05-12",
              status: "pending",
              late_minutes: 20,
              offset_minutes: 20,
              effective_late_minutes: 0,
            },
            {
              emp_id: 11,
              emp_no: "M001",
              emp_name: "经理甲",
              dept_name: "信息部",
              is_manager: true,
              date: "2026-05-13",
              status: "confirmed",
              late_minutes: 30,
              offset_minutes: 30,
              effective_late_minutes: 0,
              override_late_minutes: 0,
            },
          ],
        }),
      );
    case "/api/admin/late-offset/leaves":
      return Promise.resolve(
        jsonResponse({
          month: "2026-05",
          emp_id: 11,
          emp_name: "经理甲",
          rows: [
            {
              leave_no: "L2026001",
              leave_type: "事假",
              start_time: "2026-05-12 08:40",
              end_time: "2026-05-12 09:00",
              duration: 0.33,
              approval_status: "已审批",
              reason: "迟到冲抵20分钟",
            },
            {
              leave_no: "L2026002",
              leave_type: "年假",
              start_time: "2026-05-20 09:00",
              end_time: "2026-05-20 18:00",
              duration: 8,
              approval_status: "已审批",
              reason: "年假一天",
            },
          ],
        }),
      );
    default:
      throw new Error(`unexpected request: ${path}`);
  }
}

function jsonResponse(body: unknown, init: MockResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}
