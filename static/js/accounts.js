document.addEventListener("DOMContentLoaded", () => {
  const PAGE_LABELS = {
    query_home: "首页",
    manager_query: "管理人员考勤数据查询",
    manager_overtime_query: "查询加班",
    manager_annual_leave_query: "查询年休",
    employee_dashboard: "员工考勤数据查询",
    abnormal_query: "员工异常查询",
    punch_records: "员工打卡数据查询",
    department_hours_query: "员工部门工时查询",
    summary_download: "汇总下载",
  };

  const page = document.getElementById("accountsPage");
  const currentUserId = Number(page.dataset.currentUserId);

  const createUserForm = document.getElementById("createUserForm");
  const createResult = document.getElementById("createResult");
  const createManagerAccountsBtn = document.getElementById("createManagerAccountsBtn");
  const createPermissionInput = document.getElementById("createPermissionInput");
  const openCreatePermissionBtn = document.getElementById("openCreatePermissionBtn");
  const usersTableBody = document.getElementById("usersTableBody");
  const refreshUsersBtn = document.getElementById("refreshUsersBtn");
  const toggleSelectAllUsers = document.getElementById("toggleSelectAllUsers");
  const selectedUsersCount = document.getElementById("selectedUsersCount");
  const batchRoleSelect = document.getElementById("batchRoleSelect");
  const applyBatchRoleBtn = document.getElementById("applyBatchRoleBtn");
  const batchRoleModal = new bootstrap.Modal(document.getElementById("batchRoleModal"));
  const confirmBatchRoleBtn = document.getElementById("confirmBatchRoleBtn");
  const openBatchPermissionBtn = document.getElementById("openBatchPermissionBtn");
  const batchResetPasswordBtn = document.getElementById("batchResetPasswordBtn");
  const batchDeleteUsersBtn = document.getElementById("batchDeleteUsersBtn");
  const filterAdminRole = document.getElementById("filterAdminRole");
  const applyUserFiltersBtn = document.getElementById("applyUserFiltersBtn");
  const resetUserFiltersBtn = document.getElementById("resetUserFiltersBtn");
  const editUserForm = document.getElementById("editUserForm");
  const editUserModal = new bootstrap.Modal(document.getElementById("editUserModal"));
  const editPermissionInput = document.getElementById("editPermissionInput");
  const openEditPermissionBtn = document.getElementById("openEditPermissionBtn");
  const saveUserBtn = document.getElementById("saveUserBtn");
  const permissionCatalog = JSON.parse(document.getElementById("accountPermissionCatalog").textContent || "[]");
  const permissionModalEl = document.getElementById("accountPermissionModal");
  const permissionModal = new bootstrap.Modal(permissionModalEl);
  const permissionModalTitle = document.getElementById("accountPermissionModalTitle");
  const permissionSearch = document.getElementById("accountPermissionSearch");
  const permissionGroupFilter = document.getElementById("accountPermissionGroupFilter");
  const permissionChecklist = document.getElementById("accountPermissionChecklist");
  const permissionConfirmBtn = document.getElementById("accountPermissionConfirmBtn");

  let allUsers = [];
  let users = [];
  let employees = [];
  let departments = [];
  let activePermissionContext = null;
  let selectedUserIds = new Set();

  const allPermissionKeys = permissionCatalog.map((item) => item.key);
  const permissionState = {
    create: { selectedKeys: new Set(allPermissionKeys), inputEl: createPermissionInput, buttonEl: openCreatePermissionBtn, title: "创建账号页面权限" },
    edit: { selectedKeys: new Set(), inputEl: editPermissionInput, buttonEl: openEditPermissionBtn, title: "编辑页面权限" },
    batch: { selectedKeys: new Set(allPermissionKeys), inputEl: null, buttonEl: openBatchPermissionBtn, title: "批量修改页面权限" },
  };

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
    filter: {
      lookupEl: document.getElementById("filterEmpLookup"),
      inputEl: document.getElementById("filterEmpSearch"),
      quickEl: document.getElementById("filterEmpQuickList"),
      hiddenEl: document.createElement("input"),
      triggerEl: document.getElementById("openFilterEmpPickerBtn"),
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

  const profileDeptLookup = {
    edit: {
      lookupEl: document.getElementById("editProfileDeptLookup"),
      inputEl: document.getElementById("editProfileDeptSearch"),
      quickEl: document.getElementById("editProfileDeptQuickList"),
      hiddenEl: editUserForm.querySelector('[name="profile_dept_id"]'),
      triggerEl: document.getElementById("openEditProfileDeptPickerBtn"),
    },
  };

  function mountHidden(ctx, name) {
    ctx.hiddenEl.type = "hidden";
    ctx.hiddenEl.name = name;
    ctx.lookupEl.appendChild(ctx.hiddenEl);
  }

  mountHidden(empLookup.create, "create_emp_ids");
  mountHidden(empLookup.edit, "edit_emp_ids");
  mountHidden(empLookup.filter, "filter_emp_ids");
  mountHidden(deptLookup.create, "create_dept_ids");
  mountHidden(deptLookup.edit, "edit_dept_ids");

  function idsFromHidden(hiddenEl) {
    return (hiddenEl.value || "")
      .split(",")
      .map((id) => Number(id.trim()))
      .filter(Boolean);
  }

  const employeePicker = window.SelectorComponent.createMultiContextEmployeeSelector({
    contexts: [empLookup.create, empLookup.edit, empLookup.filter],
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

  const profileDeptPicker = window.SelectorComponent.createSingleSelectTreeLookup({
    contexts: [profileDeptLookup.edit],
    modalEl: document.getElementById("accountSingleDeptPickerModal"),
    treeEl: document.getElementById("accountSingleDeptPickerTree"),
    searchEl: document.getElementById("accountSingleDeptPickerSearch"),
    selectedEl: document.getElementById("accountSingleDeptPickerSelectedList"),
    confirmBtn: document.getElementById("accountSingleDeptPickerConfirmBtn"),
    clearBtn: document.getElementById("accountSingleDeptPickerClearBtn"),
    getEntities: () => departments,
    getId: (row) => row.id,
    getParentId: (row) => row.parent_id,
    getName: (row) => row.dept_name || "",
    getCode: (row) => row.dept_no || "",
    emptyLabel: "未选择",
  });

  function renderUsers() {
    usersTableBody.innerHTML = "";
    users.forEach((user) => {
      const employeeCodes = user.profile_emp_no || "-";
      const employeeNamesOnly = user.profile_name || "-";
      const employeeDeptNames = user.profile_department?.dept_name || "-";
      const employeeNames = user.role === "admin"
        ? "全部人员"
        : (user.employees.map((row) => `${row.emp_no}-${row.name}`).join("，") || "-");
      const deptNames = user.role === "admin"
        ? "全部部门"
        : (user.departments.map((row) => row.dept_name).join("，") || "-");
      const pagePermissions = user.page_permissions || {};
      const allowedPages = user.role === "admin"
        ? "全部页面"
        : (Object.entries(pagePermissions)
        .filter(([, allowed]) => !!allowed)
        .map(([key]) => PAGE_LABELS[key] || key)
        .join("、") || "-");
      const createdAt = user.created_at ? user.created_at.replace("T", " ").slice(0, 19) : "-";
      const selfTag = user.id === currentUserId ? " <span class='badge text-bg-info'>当前</span>" : "";
      const checked = selectedUserIds.has(user.id) ? "checked" : "";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input class="form-check-input user-select-checkbox" type="checkbox" data-id="${user.id}" ${checked}></td>
        <td>${user.id}</td>
        <td>${user.username}${selfTag}</td>
        <td>${user.role}</td>
        <td>${employeeCodes}</td>
        <td>${employeeNamesOnly}</td>
        <td>${employeeDeptNames}</td>
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
    syncBatchSelectionState();
  }

  async function refreshUsers() {
    const response = await fetch("/admin/users");
    allUsers = await response.json();
    users = allUsers.slice();
    selectedUserIds = new Set(
      Array.from(selectedUserIds).filter((id) => allUsers.some((user) => user.id === id))
    );
    applyUserFilters();
    renderUsers();
  }

  function resetCreateSelectors() {
    employeePicker.setValue(empLookup.create, []);
    deptPicker.setValue(deptLookup.create, []);
  }

  function hideCreateResult() {
    createResult.className = "d-none";
    createResult.innerHTML = "";
  }

  function formatEmployeeIdentity(row) {
    const empNo = String((row && row.emp_no) || "").trim();
    const name = String((row && row.name) || "").trim();
    if (empNo && name) return `${empNo} ${name}`;
    if (empNo) return empNo;
    if (name) return name;
    return "未命名员工";
  }

  function buildManagerBatchResultMessage(data) {
    const lines = [
      `成功创建 ${data.created_count || 0} 个账号`,
      `跳过 ${data.skipped_count || 0} 个员工`,
    ];

    const createdUsers = Array.isArray(data.created_users) ? data.created_users : [];
    if (createdUsers.length) {
      lines.push("");
      lines.push("创建成功：");
      createdUsers.forEach((user) => {
        lines.push(`- ${formatEmployeeIdentity({ emp_no: user.profile_emp_no, name: user.profile_name })}，账号：${user.username}`);
      });
    }

    const skippedUsers = Array.isArray(data.skipped_users) ? data.skipped_users : [];
    if (skippedUsers.length) {
      lines.push("");
      lines.push("跳过员工：");
      skippedUsers.forEach((row) => {
        lines.push(`- ${formatEmployeeIdentity(row)}，原因：${row.reason || "未知原因"}`);
      });
    }

    return lines.join("\n");
  }

  function selectedPermissionMap(ctxKey) {
    const keys = permissionState[ctxKey].selectedKeys;
    return Object.fromEntries(allPermissionKeys.map((key) => [key, keys.has(key)]));
  }

  function permissionSummary(ctxKey, isAdmin) {
    if (isAdmin) return "全部页面";
    const selectedLabels = permissionCatalog
      .filter((item) => permissionState[ctxKey].selectedKeys.has(item.key))
      .map((item) => item.label);
    if (!selectedLabels.length) return "未选择页面权限";
    return `已选 ${selectedLabels.length} 项：${selectedLabels.join("、")}`;
  }

  function syncPermissionInput(ctxKey, isAdmin) {
    const state = permissionState[ctxKey];
    const disabled = !!isAdmin;
    if (state.inputEl) {
      state.inputEl.value = permissionSummary(ctxKey, disabled);
      state.inputEl.disabled = disabled;
    }
    if (state.buttonEl) {
      state.buttonEl.disabled = disabled;
    }
  }

  function renderPermissionChecklist() {
    const keyword = (permissionSearch.value || "").trim();
    const groupValue = (permissionGroupFilter.value || "").trim();
    const state = permissionState[activePermissionContext];
    const rows = permissionCatalog.filter((item) => {
      const groupPass = !groupValue || item.group === groupValue;
      const keywordPass = !keyword || `${item.group}${item.label}`.includes(keyword);
      return groupPass && keywordPass;
    });
    permissionChecklist.innerHTML = rows.map((item) => `
      <label class="badge text-bg-light border p-2 d-flex align-items-center gap-2 justify-content-start w-100 mb-2">
        <input class="form-check-input m-0 permission-check-item" type="checkbox" value="${item.key}" ${state.selectedKeys.has(item.key) ? "checked" : ""}>
        <span class="text-muted small">${item.group}</span>
        <span>${item.label}</span>
      </label>
    `).join("") || `<div class="small text-muted">无匹配权限</div>`;
  }

  function openPermissionModal(ctxKey) {
    activePermissionContext = ctxKey;
    permissionModalTitle.textContent = permissionState[ctxKey].title;
    permissionSearch.value = "";
    permissionGroupFilter.value = "";
    renderPermissionChecklist();
    permissionModal.show();
  }

  function applyUserFilters() {
    const selectedEmpIds = new Set(idsFromHidden(empLookup.filter.hiddenEl));
    const roleFilter = (filterAdminRole.value || "").trim();
    users = allUsers.filter((user) => {
      if (roleFilter && user.role !== roleFilter) {
        return false;
      }
      if (selectedEmpIds.size > 0) {
        const userEmpIds = Array.isArray(user.emp_ids) ? user.emp_ids : [];
        if (!userEmpIds.some((id) => selectedEmpIds.has(Number(id)))) {
          return false;
        }
      }
      return true;
    });
  }

  function resetUserFilters() {
    employeePicker.setValue(empLookup.filter, []);
    filterAdminRole.value = "";
    users = allUsers.slice();
    renderUsers();
  }

  function selectedBatchUserIds() {
    return Array.from(selectedUserIds).filter((id) => allUsers.some((user) => user.id === id));
  }

  function syncBatchSelectionState() {
    const selectedCount = selectedBatchUserIds().length;
    selectedUsersCount.textContent = `已选 ${selectedCount} 个账号`;
    const visibleIds = users.map((user) => user.id);
    const visibleSelectedCount = visibleIds.filter((id) => selectedUserIds.has(id)).length;
    toggleSelectAllUsers.checked = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
    toggleSelectAllUsers.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visibleIds.length;
  }

  async function runBatchAction(payload, successTitle, successMessage) {
    const userIds = selectedBatchUserIds();
    if (!userIds.length) {
      window.AppDialog.alert("请先选择要批量操作的账号", "未选择账号");
      return false;
    }
    const response = await fetch("/admin/users/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, user_ids: userIds }),
    });
    const data = await response.json();
    if (!response.ok) {
      window.AppDialog.alert(data.error || "批量操作失败", "批量操作失败");
      return false;
    }
    window.AppToast.success(successMessage, successTitle);
    await refreshUsers();
    return true;
  }

  function setupEditPanel(user) {
    profileDeptPicker.setValue(profileDeptLookup.edit, user.profile_dept_id || "");
    const editEmpIds = user.role === "admin"
      ? employees.map((row) => row.id)
      : (user.emp_ids || []);
    const editDeptIds = user.role === "admin"
      ? departments.map((row) => row.id)
      : (user.dept_ids || []);
    employeePicker.setValue(empLookup.edit, editEmpIds);
    deptPicker.setValue(deptLookup.edit, editDeptIds);
    permissionState.edit.selectedKeys = new Set(
      Object.entries(user.page_permissions || {})
        .filter(([, allowed]) => !!allowed)
        .map(([key]) => key)
    );
    syncPermissionInput("edit", user.role === "admin");
  }

  function collectPagePermissions(selector) {
    return selectedPermissionMap(selector);
  }

  function syncRolePermissionState(form, permissionCtxKey) {
    const role = form.querySelector('[name="role"]').value;
    const isAdmin = role === "admin";
    if (isAdmin) {
      permissionState[permissionCtxKey].selectedKeys = new Set(allPermissionKeys);
    } else if (!permissionState[permissionCtxKey].selectedKeys.size) {
      permissionState[permissionCtxKey].selectedKeys = new Set(allPermissionKeys);
    }
    syncPermissionInput(permissionCtxKey, isAdmin);
  }

  function collectCreatePayload() {
    return {
      username: createUserForm.querySelector('[name="username"]').value,
      password: createUserForm.querySelector('[name="password"]').value,
      role: createUserForm.querySelector('[name="role"]').value,
      emp_ids: idsFromHidden(empLookup.create.hiddenEl),
      dept_ids: idsFromHidden(deptLookup.create.hiddenEl),
      page_permissions: collectPagePermissions("create"),
    };
  }

  function collectEditPayload() {
    return {
      profile_emp_no: editUserForm.querySelector('[name="profile_emp_no"]').value,
      profile_name: editUserForm.querySelector('[name="profile_name"]').value,
      profile_dept_id: Number(editUserForm.querySelector('[name="profile_dept_id"]').value || 0),
      role: editUserForm.querySelector('[name="role"]').value,
      emp_ids: idsFromHidden(empLookup.edit.hiddenEl),
      dept_ids: idsFromHidden(deptLookup.edit.hiddenEl),
      page_permissions: collectPagePermissions("edit"),
    };
  }

  createUserForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!idsFromHidden(empLookup.create.hiddenEl).length) {
      window.AppFeedback.setResult(createResult, "请至少关联一名员工，工号和姓名为必填项", "danger");
      window.AppToast.error("请至少关联一名员工，工号和姓名为必填项", "创建账号失败");
      return;
    }
    const response = await fetch("/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectCreatePayload()),
    });
    const data = await response.json();
    if (!response.ok) {
      window.AppFeedback.setResult(createResult, data.error || "创建失败", "danger");
      window.AppToast.error(data.error || "创建失败", "创建账号失败");
      return;
    }
    window.AppFeedback.setResult(createResult, "创建成功", "success");
    window.AppToast.success("创建成功", "创建账号成功");
    createUserForm.reset();
    resetCreateSelectors();
    permissionState.create.selectedKeys = new Set(allPermissionKeys);
    syncPermissionInput("create", false);
    await refreshUsers();
  });

  refreshUsersBtn.addEventListener("click", refreshUsers);
  applyUserFiltersBtn.addEventListener("click", () => {
    applyUserFilters();
    renderUsers();
  });
  resetUserFiltersBtn.addEventListener("click", resetUserFilters);

  usersTableBody.addEventListener("click", async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const userId = Number(target.dataset.id || 0);
    const user = users.find((row) => row.id === userId);
    if (!user) return;

    if (target.classList.contains("edit-btn")) {
      editUserForm.querySelector('[name="user_id"]').value = String(user.id);
      editUserForm.querySelector('[name="profile_emp_no"]').value = user.profile_emp_no || "";
      editUserForm.querySelector('[name="profile_name"]').value = user.profile_name || "";
      editUserForm.querySelector('[name="username"]').value = user.username;
      editUserForm.querySelector('[name="role"]').value = user.role;
      setupEditPanel(user);
      syncRolePermissionState(editUserForm, "edit");
      editUserModal.show();
      return;
    }

    if (target.classList.contains("reset-btn")) {
      const nextPassword = await window.AppDialog.prompt(`请输入 ${user.username} 的新密码：`, "", "重置密码", "新密码");
      if (!nextPassword) return;
      const response = await fetch(`/admin/users/${user.id}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: nextPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        window.AppDialog.alert(data.error || "重置密码失败", "重置密码失败");
        return;
      }
      window.AppDialog.alert("密码已重置", "重置成功");
      window.AppToast.success("密码已重置", "重置成功");
      return;
    }

    if (target.classList.contains("delete-btn")) {
      if (!(await window.AppDialog.confirm(`确定删除账号 ${user.username} 吗？`, "删除账号"))) return;
      const response = await fetch(`/admin/users/${user.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        window.AppDialog.alert(data.error || "删除失败", "删除失败");
        return;
      }
      window.AppToast.success("账号已删除", "删除成功");
      await refreshUsers();
    }
  });

  usersTableBody.addEventListener("change", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement) || !target.classList.contains("user-select-checkbox")) return;
    const userId = Number(target.dataset.id || 0);
    if (!userId) return;
    if (target.checked) selectedUserIds.add(userId);
    else selectedUserIds.delete(userId);
    syncBatchSelectionState();
  });

  saveUserBtn.addEventListener("click", async () => {
    const userId = Number(editUserForm.querySelector('[name="user_id"]').value || 0);
    if (!userId) return;
    if (!editUserForm.querySelector('[name="profile_emp_no"]').value.trim()) {
      window.AppDialog.alert("请输入工号", "更新失败");
      return;
    }
    if (!editUserForm.querySelector('[name="profile_name"]').value.trim()) {
      window.AppDialog.alert("请输入姓名", "更新失败");
      return;
    }
    if (!Number(editUserForm.querySelector('[name="profile_dept_id"]').value || 0)) {
      window.AppDialog.alert("请选择部门信息", "更新失败");
      return;
    }
    if (!idsFromHidden(empLookup.edit.hiddenEl).length) {
      window.AppDialog.alert("请至少关联一名员工，工号和姓名为必填项", "更新失败");
      return;
    }
    const response = await fetch(`/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectEditPayload()),
    });
    const data = await response.json();
    if (!response.ok) {
      window.AppDialog.alert(data.error || "更新失败", "更新失败");
      return;
    }
    window.AppToast.success("账号已更新", "更新成功");
    editUserModal.hide();
    await refreshUsers();
  });

  createManagerAccountsBtn.addEventListener("click", async () => {
    createManagerAccountsBtn.disabled = true;
    const response = await fetch("/admin/users/manager-batch", { method: "POST" });
    const data = await response.json();
    createManagerAccountsBtn.disabled = false;
    if (!response.ok) {
      window.AppFeedback.setResult(createResult, data.error || "批量创建失败", "danger");
      window.AppToast.error(data.error || "批量创建失败", "批量创建失败");
      return;
    }
    const message = buildManagerBatchResultMessage(data);
    hideCreateResult();
    window.AppToast.success(message, "批量创建完成");
    await refreshUsers();
  });

  createUserForm.querySelector('[name="role"]').addEventListener("change", () => {
    syncRolePermissionState(createUserForm, "create");
  });
  editUserForm.querySelector('[name="role"]').addEventListener("change", () => {
    syncRolePermissionState(editUserForm, "edit");
  });

  createPermissionInput.addEventListener("click", () => {
    if (!createPermissionInput.disabled) openPermissionModal("create");
  });
  openCreatePermissionBtn.addEventListener("click", () => openPermissionModal("create"));
  editPermissionInput.addEventListener("click", () => {
    if (!editPermissionInput.disabled) openPermissionModal("edit");
  });
  openEditPermissionBtn.addEventListener("click", () => openPermissionModal("edit"));
  openBatchPermissionBtn.addEventListener("click", () => {
    if (!selectedBatchUserIds().length) {
      window.AppDialog.alert("请先选择要批量操作的账号", "未选择账号");
      return;
    }
    permissionState.batch.selectedKeys = new Set(allPermissionKeys);
    openPermissionModal("batch");
  });
  permissionSearch.addEventListener("input", renderPermissionChecklist);
  permissionGroupFilter.addEventListener("change", renderPermissionChecklist);
  permissionChecklist.addEventListener("change", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox" || !activePermissionContext) return;
    const state = permissionState[activePermissionContext];
    if (target.checked) state.selectedKeys.add(target.value);
    else state.selectedKeys.delete(target.value);
  });
  permissionConfirmBtn.addEventListener("click", () => {
    if (!activePermissionContext) return;
    if (activePermissionContext === "batch") {
      const pagePermissions = selectedPermissionMap("batch");
      runBatchAction(
        { action: "update_permissions", page_permissions: pagePermissions },
        "批量修改成功",
        "已批量更新页面权限"
      ).then((success) => {
        if (!success) return;
        permissionModal.hide();
      });
      return;
    }
    syncPermissionInput(activePermissionContext, false);
    permissionModal.hide();
  });

  toggleSelectAllUsers.addEventListener("change", () => {
    users.forEach((user) => {
      if (toggleSelectAllUsers.checked) selectedUserIds.add(user.id);
      else selectedUserIds.delete(user.id);
    });
    renderUsers();
  });
  applyBatchRoleBtn.addEventListener("click", () => {
    if (!selectedBatchUserIds().length) {
      window.AppDialog.alert("请先选择要批量操作的账号", "未选择账号");
      return;
    }
    batchRoleSelect.value = "";
    batchRoleModal.show();
  });
  confirmBatchRoleBtn.addEventListener("click", async () => {
    const role = (batchRoleSelect.value || "").trim();
    if (!role) {
      window.AppDialog.alert("请选择要批量设置的角色", "未选择角色");
      return;
    }
    const success = await runBatchAction(
      { action: "update_role", role },
      "批量修改成功",
      "已批量更新账号角色"
    );
    if (success) {
      batchRoleModal.hide();
    }
  });
  batchResetPasswordBtn.addEventListener("click", async () => {
    if (!(await window.AppDialog.confirm("确定将所选账号密码统一重置为 mt@123 吗？", "批量重置密码"))) return;
    await runBatchAction(
      { action: "reset_password" },
      "批量重置成功",
      "已批量重置密码为 mt@123"
    );
  });
  batchDeleteUsersBtn.addEventListener("click", async () => {
    if (!(await window.AppDialog.confirm("确定删除所选账号吗？删除后不可恢复。", "批量删除账号"))) return;
    const success = await runBatchAction(
      { action: "delete" },
      "批量删除成功",
      "已批量删除所选账号"
    );
    if (success) {
      selectedUserIds = new Set();
      syncBatchSelectionState();
    }
  });

  (async () => {
    const [usersRes, employeesRes, departmentsRes] = await Promise.all([
      fetch("/admin/users"),
      fetch("/admin/employees"),
      fetch("/admin/departments"),
    ]);
    allUsers = await usersRes.json();
    users = allUsers.slice();
    employees = await employeesRes.json();
    departments = await departmentsRes.json();
    employeePicker.refresh();
    deptPicker.refresh();
    profileDeptPicker.refresh();
    renderUsers();
    resetCreateSelectors();
    permissionState.create.selectedKeys = new Set(allPermissionKeys);
    permissionState.edit.selectedKeys = new Set(allPermissionKeys);
    permissionState.batch.selectedKeys = new Set(allPermissionKeys);
    syncRolePermissionState(createUserForm, "create");
    syncPermissionInput("edit", false);
    employeePicker.setValue(empLookup.edit, []);
    employeePicker.setValue(empLookup.filter, []);
    deptPicker.setValue(deptLookup.edit, []);
    profileDeptPicker.setValue(profileDeptLookup.edit, "");
    syncBatchSelectionState();
  })();
});
