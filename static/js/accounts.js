document.addEventListener("DOMContentLoaded", () => {
  const PAGE_LABELS = {
    manager_query: "管理人员查询",
    manager_overtime_query: "查询加班",
    manager_annual_leave_query: "查询年休",
    employee_dashboard: "考勤数据查询",
    abnormal_query: "员工异常查询",
    punch_records: "打卡数据查询",
    department_hours_query: "员工部门工时查询",
    summary_download: "汇总下载",
  };

  const page = document.getElementById("accountsPage");
  const currentUserId = Number(page.dataset.currentUserId);

  const createUserForm = document.getElementById("createUserForm");
  const createResult = document.getElementById("createResult");
  const usersTableBody = document.getElementById("usersTableBody");
  const refreshUsersBtn = document.getElementById("refreshUsersBtn");
  const editUserForm = document.getElementById("editUserForm");
  const editUserModal = new bootstrap.Modal(document.getElementById("editUserModal"));
  const saveUserBtn = document.getElementById("saveUserBtn");

  let users = [];
  let employees = [];
  let departments = [];

  const empLookup = {
    create: {
      lookupEl: document.getElementById("createEmpLookup"),
      inputEl: document.getElementById("createEmpSearch"),
      quickEl: document.getElementById("createEmpQuickList"),
      hiddenEl: document.createElement("input"),
      triggerEl: document.getElementById("openCreateEmpPickerBtn"),
    },
    edit: {
      lookupEl: document.getElementById("editEmpLookup"),
      inputEl: document.getElementById("editEmpSearch"),
      quickEl: document.getElementById("editEmpQuickList"),
      hiddenEl: document.createElement("input"),
      triggerEl: document.getElementById("openEditEmpPickerBtn"),
    },
  };

  const deptLookup = {
    create: {
      lookupEl: document.getElementById("createDeptLookup"),
      inputEl: document.getElementById("createDeptSearch"),
      quickEl: document.getElementById("createDeptQuickList"),
      hiddenEl: document.createElement("input"),
      triggerEl: document.getElementById("openCreateDeptPickerBtn"),
    },
    edit: {
      lookupEl: document.getElementById("editDeptLookup"),
      inputEl: document.getElementById("editDeptSearch"),
      quickEl: document.getElementById("editDeptQuickList"),
      hiddenEl: document.createElement("input"),
      triggerEl: document.getElementById("openEditDeptPickerBtn"),
    },
  };

  function mountHidden(ctx, name) {
    ctx.hiddenEl.type = "hidden";
    ctx.hiddenEl.name = name;
    ctx.lookupEl.appendChild(ctx.hiddenEl);
  }

  mountHidden(empLookup.create, "create_emp_ids");
  mountHidden(empLookup.edit, "edit_emp_ids");
  mountHidden(deptLookup.create, "create_dept_ids");
  mountHidden(deptLookup.edit, "edit_dept_ids");

  function idsFromHidden(hiddenEl) {
    return (hiddenEl.value || "")
      .split(",")
      .map((id) => Number(id.trim()))
      .filter(Boolean);
  }

  const employeePicker = window.SelectorComponent.createMultiContextEmployeeSelector({
    contexts: [empLookup.create, empLookup.edit],
    modalEl: document.getElementById("accountEmployeePickerModal"),
    deptTreeEl: document.getElementById("accountEmpDeptList"),
    searchEl: document.getElementById("accountEmpPickerSearch"),
    listEl: document.getElementById("accountEmpPickerList"),
    selectedEl: document.getElementById("accountEmpPickerSelectedList"),
    selectedCountEl: document.getElementById("accountEmpPickerSelectedCount"),
    selectVisibleEl: document.getElementById("accountEmpPickerSelectVisible"),
    clearBtn: document.getElementById("accountEmpPickerClearBtn"),
    confirmBtn: document.getElementById("accountEmpPickerConfirmBtn"),
    getEmployees: () => employees,
    getDepartments: () => departments,
    getEmpId: (row) => row.id,
    getEmpName: (row) => row.name || "",
    getEmpCode: (row) => row.emp_no || "",
    getEmpDeptId: (row) => row.dept_id,
    getEmpDeptName: (row) => row.dept_name || "",
    getDeptId: (row) => row.id,
    getDeptParentId: (row) => row.parent_id,
    getDeptName: (row) => row.dept_name || "",
  });

  const deptPicker = window.SelectorComponent.createMultiSelectTreeLookup({
    contexts: [deptLookup.create, deptLookup.edit],
    modalEl: document.getElementById("accountDeptPickerModal"),
    treeEl: document.getElementById("accountDeptPickerTree"),
    searchEl: document.getElementById("accountDeptPickerSearch"),
    selectedEl: document.getElementById("accountDeptPickerSelectedList"),
    selectedCountEl: document.getElementById("accountDeptPickerSelectedCount"),
    selectAllEl: document.getElementById("accountDeptPickerSelectAll"),
    confirmBtn: document.getElementById("accountDeptPickerConfirmBtn"),
    clearBtn: document.getElementById("accountDeptPickerClearBtn"),
    getEntities: () => departments,
    getId: (row) => row.id,
    getParentId: (row) => row.parent_id,
    getName: (row) => row.dept_name || "",
    getCode: (row) => row.dept_no || "",
  });

  function renderUsers() {
    usersTableBody.innerHTML = "";
    users.forEach((user) => {
      const employeeNames = user.employees.map((row) => `${row.emp_no}-${row.name}`).join("，") || "-";
      const deptNames = user.departments.map((row) => row.dept_name).join("，") || "-";
      const pagePermissions = user.page_permissions || {};
      const allowedPages = user.role === "admin"
        ? "全部页面"
        : (Object.entries(pagePermissions)
        .filter(([, allowed]) => !!allowed)
        .map(([key]) => PAGE_LABELS[key] || key)
        .join("、") || "-");
      const createdAt = user.created_at ? user.created_at.replace("T", " ").slice(0, 19) : "-";
      const selfTag = user.id === currentUserId ? " <span class='badge text-bg-info'>当前</span>" : "";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${user.id}</td>
        <td>${user.username}${selfTag}</td>
        <td>${user.role}</td>
        <td>${employeeNames}</td>
        <td>${deptNames}</td>
        <td>${allowedPages}</td>
        <td>${createdAt}</td>
        <td class="d-flex gap-1">
          <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${user.id}">编辑</button>
          <button class="btn btn-sm btn-outline-warning reset-btn" data-id="${user.id}">重置密码</button>
          <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${user.id}">删除</button>
        </td>
      `;
      usersTableBody.appendChild(tr);
    });
  }

  async function refreshUsers() {
    const response = await fetch("/admin/users");
    users = await response.json();
    renderUsers();
  }

  function resetCreateSelectors() {
    employeePicker.setValue(empLookup.create, []);
    deptPicker.setValue(deptLookup.create, []);
  }

  function setupEditPanel(user) {
    employeePicker.setValue(empLookup.edit, user.emp_ids || []);
    deptPicker.setValue(deptLookup.edit, user.dept_ids || []);
    setPermissionCheckboxes(".edit-page-permission", user.page_permissions || {}, user.role === "admin");
  }

  function collectPagePermissions(selector) {
    const result = {};
    document.querySelectorAll(selector).forEach((input) => {
      result[input.value] = !!input.checked;
    });
    return result;
  }

  function setPermissionCheckboxes(selector, permissions, disabled) {
    document.querySelectorAll(selector).forEach((input) => {
      input.checked = !!permissions[input.value];
      input.disabled = !!disabled;
    });
  }

  function syncRolePermissionState(form, selector) {
    const role = form.querySelector('[name="role"]').value;
    const isAdmin = role === "admin";
    document.querySelectorAll(selector).forEach((input) => {
      if (isAdmin) input.checked = true;
      input.disabled = isAdmin;
    });
  }

  function collectCreatePayload() {
    return {
      username: createUserForm.querySelector('[name="username"]').value,
      password: createUserForm.querySelector('[name="password"]').value,
      role: createUserForm.querySelector('[name="role"]').value,
      emp_ids: idsFromHidden(empLookup.create.hiddenEl),
      dept_ids: idsFromHidden(deptLookup.create.hiddenEl),
      page_permissions: collectPagePermissions(".create-page-permission"),
    };
  }

  function collectEditPayload() {
    return {
      role: editUserForm.querySelector('[name="role"]').value,
      emp_ids: idsFromHidden(empLookup.edit.hiddenEl),
      dept_ids: idsFromHidden(deptLookup.edit.hiddenEl),
      page_permissions: collectPagePermissions(".edit-page-permission"),
    };
  }

  createUserForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const response = await fetch("/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectCreatePayload()),
    });
    const data = await response.json();
    if (!response.ok) {
      createResult.textContent = data.error || "创建失败";
      return;
    }
    createResult.textContent = "创建成功";
    createUserForm.reset();
    resetCreateSelectors();
    setPermissionCheckboxes(
      ".create-page-permission",
      Object.fromEntries(Array.from(document.querySelectorAll(".create-page-permission")).map((input) => [input.value, true])),
      false
    );
    await refreshUsers();
  });

  refreshUsersBtn.addEventListener("click", refreshUsers);

  usersTableBody.addEventListener("click", async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const userId = Number(target.dataset.id || 0);
    const user = users.find((row) => row.id === userId);
    if (!user) return;

    if (target.classList.contains("edit-btn")) {
      editUserForm.querySelector('[name="user_id"]').value = String(user.id);
      editUserForm.querySelector('[name="username"]').value = user.username;
      editUserForm.querySelector('[name="role"]').value = user.role;
      setupEditPanel(user);
      syncRolePermissionState(editUserForm, ".edit-page-permission");
      editUserModal.show();
      return;
    }

    if (target.classList.contains("reset-btn")) {
      const nextPassword = window.prompt(`请输入 ${user.username} 的新密码：`);
      if (!nextPassword) return;
      const response = await fetch(`/admin/users/${user.id}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: nextPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        window.alert(data.error || "重置密码失败");
        return;
      }
      window.alert("密码已重置");
      return;
    }

    if (target.classList.contains("delete-btn")) {
      if (!window.confirm(`确定删除账号 ${user.username} 吗？`)) return;
      const response = await fetch(`/admin/users/${user.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        window.alert(data.error || "删除失败");
        return;
      }
      await refreshUsers();
    }
  });

  saveUserBtn.addEventListener("click", async () => {
    const userId = Number(editUserForm.querySelector('[name="user_id"]').value || 0);
    if (!userId) return;
    const response = await fetch(`/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectEditPayload()),
    });
    const data = await response.json();
    if (!response.ok) {
      window.alert(data.error || "更新失败");
      return;
    }
    editUserModal.hide();
    await refreshUsers();
  });

  createUserForm.querySelector('[name="role"]').addEventListener("change", () => {
    syncRolePermissionState(createUserForm, ".create-page-permission");
  });
  editUserForm.querySelector('[name="role"]').addEventListener("change", () => {
    syncRolePermissionState(editUserForm, ".edit-page-permission");
  });

  (async () => {
    const [usersRes, employeesRes, departmentsRes] = await Promise.all([
      fetch("/admin/users"),
      fetch("/admin/employees"),
      fetch("/admin/departments"),
    ]);
    users = await usersRes.json();
    employees = await employeesRes.json();
    departments = await departmentsRes.json();
    employeePicker.refresh();
    deptPicker.refresh();
    renderUsers();
    resetCreateSelectors();
    syncRolePermissionState(createUserForm, ".create-page-permission");
    setPermissionCheckboxes(".edit-page-permission", {}, false);
    employeePicker.setValue(empLookup.edit, []);
    deptPicker.setValue(deptLookup.edit, []);
  })();
});
