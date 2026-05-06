document.addEventListener("DOMContentLoaded", () => {
  const createForm = document.getElementById("createEmployeeForm");
  const importForm = document.getElementById("importEmployeeForm");
  const createResult = document.getElementById("employeeCreateResult");
  const importResult = document.getElementById("employeeImportResult");
  const tableBody = document.getElementById("employeeTableBody");
  const refreshBtn = document.getElementById("refreshEmployeeBtn");
  const selectedCount = document.getElementById("selectedCount");
  const selectAll = document.getElementById("selectAllEmployees");
  const clearSelectionBtn = document.getElementById("clearSelectionBtn");
  const clearEmployeeFilterBtn = document.getElementById("clearEmployeeFilterBtn");
  const employeeFilterMeta = document.getElementById("employeeFilterMeta");
  const batchAction = document.getElementById("batchAction");
  const batchValue = document.getElementById("batchValue");
  const batchShiftValue = document.getElementById("batchShiftValue");
  const batchManagerValue = document.getElementById("batchManagerValue");
  const batchNursingValue = document.getElementById("batchNursingValue");
  const batchEmployeeAttendanceSourceValue = document.getElementById("batchEmployeeAttendanceSourceValue");
  const batchManagerAttendanceSourceValue = document.getElementById("batchManagerAttendanceSourceValue");
  const batchDeptInlineLookup = document.getElementById("batchDeptInlineLookup");
  const applyBatchBtn = document.getElementById("applyBatchBtn");
  const createShiftSelect = createForm.querySelector('[name="shift_no"]');
  const createEmployeeIsManager = document.getElementById("createEmployeeIsManager");
  const createEmployeeAttendanceSourceSelect = createForm.querySelector('[name="employee_stats_attendance_source"]');
  const createManagerAttendanceSourceSelect = createForm.querySelector('[name="manager_stats_attendance_source"]');
  const employeeAttendanceSourceHelpText = document.getElementById("employeeAttendanceSourceHelpText");
  const managerAttendanceSourceHelpText = document.getElementById("managerAttendanceSourceHelpText");
  const attendanceFallbackNoticeModalEl = document.getElementById("attendanceFallbackNoticeModal");
  const attendanceFallbackNoticeConfirmBtn = document.getElementById("attendanceFallbackNoticeConfirmBtn");
  const attendanceFallbackNoticeModal = attendanceFallbackNoticeModalEl ? new bootstrap.Modal(attendanceFallbackNoticeModalEl) : null;

  let employees = [];
  let shifts = [];
  let departments = [];
  let selectedEmployeeIds = new Set();

  const attendanceFallbackNoticeCookie = "attendance_fallback_notice_seen";

  const employeeFilterContext = {
    lookupEl: document.getElementById("employeeManageFilterLookup"),
    inputEl: document.getElementById("employeeManageFilterInput"),
    quickEl: document.getElementById("employeeManageFilterQuickList"),
    hiddenEl: document.getElementById("employeeManageFilterIds"),
    triggerEl: document.getElementById("openEmployeeManageFilterBtn"),
  };

  const deptLookupContexts = {
    create: {
      lookupEl: document.getElementById("createEmployeeDeptLookup"),
      inputEl: document.getElementById("createEmployeeDeptInput"),
      hiddenEl: document.getElementById("createEmployeeDeptId"),
      triggerEl: document.getElementById("openCreateEmployeeDeptPickerBtn"),
      quickEl: document.getElementById("createEmployeeDeptQuickList"),
    },
    batch: {
      lookupEl: document.getElementById("batchDeptInlineLookup"),
      inputEl: document.getElementById("batchDeptInlineInput"),
      hiddenEl: document.getElementById("batchDeptInlineId"),
      triggerEl: document.getElementById("openBatchDeptInlinePickerBtn"),
      quickEl: document.getElementById("batchDeptInlineQuickList"),
    },
  };

  function deptNameById(id) {
    const dept = departments.find((x) => String(x.id) === String(id));
    return dept ? dept.dept_name || "" : "";
  }

  function getCookie(name) {
    const cookie = document.cookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${name}=`));
    if (!cookie) return "";
    return decodeURIComponent(cookie.split("=").slice(1).join("="));
  }

  function setCookie(name, value, days = 365) {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  }

  function hasSeenAttendanceFallbackNotice() {
    return getCookie(attendanceFallbackNoticeCookie) === "1";
  }

  function markAttendanceFallbackNoticeSeen() {
    setCookie(attendanceFallbackNoticeCookie, "1");
  }

  function maybeShowAttendanceFallbackNotice(value) {
    if (value !== "auto_fallback") return;
    if (hasSeenAttendanceFallbackNotice()) return;
    if (!attendanceFallbackNoticeModal) return;
    attendanceFallbackNoticeModal.show();
  }

  function syncCreateAttendanceSourceMode() {
    const isManager = createEmployeeIsManager?.checked;
    if (createEmployeeAttendanceSourceSelect) {
      createEmployeeAttendanceSourceSelect.disabled = !!isManager;
    }
    if (createManagerAttendanceSourceSelect) {
      createManagerAttendanceSourceSelect.disabled = !isManager;
    }
    if (employeeAttendanceSourceHelpText) {
      employeeAttendanceSourceHelpText.textContent = isManager
        ? "当前为管理人员，该项不生效且不可编辑。"
        : "当前为普通员工，该项生效。";
    }
    if (managerAttendanceSourceHelpText) {
      managerAttendanceSourceHelpText.textContent = isManager
        ? "当前为管理人员，该项生效。"
        : "当前为普通员工，该项不生效且不可编辑。";
    }
  }

  function idsFromHidden(hiddenEl) {
    return (hiddenEl.value || "")
      .split(",")
      .map((id) => Number(id.trim()))
      .filter(Boolean);
  }

  function normalizeText(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, "");
  }

  function getSelectedIds() {
    return Array.from(selectedEmployeeIds);
  }

  function getFilteredEmployees() {
    const filterIds = idsFromHidden(employeeFilterContext.hiddenEl);
    if (filterIds.length) {
      const filterSet = new Set(filterIds);
      return employees.filter((employee) => filterSet.has(Number(employee.id)));
    }
    const keyword = normalizeText(employeeFilterContext.inputEl.value);
    if (!keyword) return employees;
    return employees.filter((employee) => {
      const haystack = normalizeText(`${employee.emp_no || ""} ${employee.name || ""} ${employee.dept_name || ""}`);
      return haystack.includes(keyword);
    });
  }

  function syncEmployeeFilterMeta(visibleCount) {
    const filterCount = idsFromHidden(employeeFilterContext.hiddenEl).length;
    const keyword = normalizeText(employeeFilterContext.inputEl.value);
    if (filterCount) {
      employeeFilterMeta.textContent = `筛选 ${filterCount} 人，显示 ${visibleCount} / 共 ${employees.length} 人`;
    } else if (keyword) {
      employeeFilterMeta.textContent = `关键词筛选，显示 ${visibleCount} / 共 ${employees.length} 人`;
    } else {
      employeeFilterMeta.textContent = `显示全部员工，共 ${employees.length} 人`;
    }
  }

  function syncSelectedCount() {
    const visibleChecks = Array.from(tableBody.querySelectorAll(".employee-check"));
    const checkedVisible = visibleChecks.filter((checkbox) => checkbox.checked);
    selectedCount.textContent = `已选 ${selectedEmployeeIds.size} 人`;
    selectAll.checked = visibleChecks.length > 0 && checkedVisible.length === visibleChecks.length;
    selectAll.indeterminate = checkedVisible.length > 0 && checkedVisible.length < visibleChecks.length;
  }

  function renderRows() {
    tableBody.innerHTML = "";
    const rows = getFilteredEmployees();
    syncEmployeeFilterMeta(rows.length);
    if (!rows.length) {
      tableBody.innerHTML = `<tr><td class="text-muted" colspan="11">暂无匹配员工</td></tr>`;
      syncSelectedCount();
      return;
    }
    for (const employee of rows) {
      const shiftText = employee.shift_no ? `${employee.shift_no} - ${employee.shift_name || ""}` : "-";
      const employeeType = employee.is_manager ? "管理人员" : "普通员工";
      const nursingText = employee.is_nursing ? "是" : "否";
      const employeeAttendanceSourceText =
        employee.employee_stats_attendance_source === "manager"
          ? "管理人员考勤源文件取值"
          : employee.employee_stats_attendance_source === "auto_fallback"
            ? "自动回退"
            : "员工考勤源文件取值";
      const managerAttendanceSourceText =
        employee.manager_stats_attendance_source === "employee"
          ? "员工考勤源文件取值"
          : employee.manager_stats_attendance_source === "auto_fallback"
            ? "自动回退"
            : "管理人员考勤源文件取值";
      const checked = selectedEmployeeIds.has(Number(employee.id)) ? "checked" : "";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="checkbox" class="employee-check" value="${employee.id}" ${checked}></td>
        <td>${employee.id}</td>
        <td>${employee.emp_no}</td>
        <td>${employee.name}</td>
        <td>${employeeType}</td>
        <td>${nursingText}</td>
        <td>${employeeAttendanceSourceText}</td>
        <td>${managerAttendanceSourceText}</td>
        <td>${employee.dept_name || "-"}</td>
        <td>${shiftText}</td>
        <td><button class="btn btn-sm btn-outline-danger delete-single-btn" data-id="${employee.id}">删除</button></td>
      `;
      tableBody.appendChild(tr);
    }
    syncSelectedCount();
  }

  async function loadEmployees() {
    const res = await fetch("/admin/employees");
    const data = await res.json();
    employees = Array.isArray(data) ? data : [];
    const employeeIds = new Set(employees.map((employee) => Number(employee.id)));
    selectedEmployeeIds = new Set(Array.from(selectedEmployeeIds).filter((id) => employeeIds.has(id)));
    employeeFilter.refresh();
    renderRows();
  }

  async function loadShifts() {
    const res = await fetch("/admin/shifts");
    const data = await res.json();
    shifts = Array.isArray(data) ? data : [];

    const current = createShiftSelect.value;
    createShiftSelect.innerHTML = `<option value="">不绑定</option>` + shifts
      .map((s) => `<option value="${s.shift_no}">${s.shift_no} - ${s.shift_name}</option>`)
      .join("");
    if (current && shifts.find((s) => s.shift_no === current)) {
      createShiftSelect.value = current;
    }

    const batchCurrent = batchShiftValue.value;
    batchShiftValue.innerHTML = `<option value="">选择班次</option>` + shifts
      .map((s) => `<option value="${s.shift_no}">${s.shift_no} - ${s.shift_name}</option>`)
      .join("");
    if (batchCurrent && shifts.find((s) => s.shift_no === batchCurrent)) {
      batchShiftValue.value = batchCurrent;
    }
  }

  async function loadDepartments() {
    const res = await fetch("/admin/departments");
    const data = await res.json();
    departments = Array.isArray(data) ? data : [];
    deptPicker.refresh();
    employeeFilter.refresh();
  }

  async function applyBatch(action, value, ids) {
    const payload = { action, ids };
    if (action === "set_name") payload.name = value;
    if (action === "set_emp_no") payload.emp_no = value;
    if (action === "set_department") payload.dept_name = value;
    if (action === "set_shift") payload.shift_no = value;
    if (action === "set_manager") payload.is_manager = value === "1";
    if (action === "set_nursing") payload.is_nursing = value === "1";
    if (action === "set_employee_stats_attendance_source") payload.employee_stats_attendance_source = value;
    if (action === "set_manager_stats_attendance_source") payload.manager_stats_attendance_source = value;

    const res = await fetch("/admin/employees/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      window.alert(data.error || "批量操作失败");
      return false;
    }
    return true;
  }

  function resetBatchInputs() {
    batchValue.value = "";
    batchShiftValue.value = "";
    batchManagerValue.value = "";
    batchNursingValue.value = "";
    batchEmployeeAttendanceSourceValue.value = "";
    batchManagerAttendanceSourceValue.value = "";
    deptPicker.setValue(deptLookupContexts.batch, "");
  }

  function syncBatchInputMode() {
    const action = batchAction.value;
    batchValue.classList.toggle(
      "d-none",
      action === "set_department"
        || action === "set_shift"
        || action === "set_manager"
        || action === "set_nursing"
        || action === "set_employee_stats_attendance_source"
        || action === "set_manager_stats_attendance_source"
    );
    batchShiftValue.classList.toggle("d-none", action !== "set_shift");
    batchManagerValue.classList.toggle("d-none", action !== "set_manager");
    batchNursingValue.classList.toggle("d-none", action !== "set_nursing");
    batchEmployeeAttendanceSourceValue.classList.toggle("d-none", action !== "set_employee_stats_attendance_source");
    batchManagerAttendanceSourceValue.classList.toggle("d-none", action !== "set_manager_stats_attendance_source");
    batchDeptInlineLookup.classList.toggle("d-none", action !== "set_department");

    if (action === "set_name") {
      batchValue.placeholder = "输入新姓名";
    } else if (action === "set_emp_no") {
      batchValue.placeholder = "输入新人员编号";
    } else {
      batchValue.placeholder = "操作值";
    }
  }

  const deptPicker = window.SelectorComponent.createSingleSelectTreeLookup({
    contexts: Object.values(deptLookupContexts),
    getEntities: () => departments,
    getId: (x) => x.id,
    getParentId: (x) => x.parent_id,
    getName: (x) => x.dept_name || "",
    getCode: (x) => x.dept_no || "",
    emptyLabel: "无部门",
    emptySelectedHtml: `<div class="employee-selected-empty">未选择部门</div>`,
    modalEl: document.getElementById("employeeDeptPickerModal"),
    treeEl: document.getElementById("employeeDeptPickerTree"),
    searchEl: document.getElementById("employeeDeptPickerSearchInput"),
    selectedEl: document.getElementById("employeeDeptPickerSelectedList"),
    confirmBtn: document.getElementById("employeeDeptPickerConfirmBtn"),
    clearBtn: document.getElementById("employeeDeptPickerClearBtn"),
  });

  const employeeFilter = window.SelectorComponent.createMultiContextEmployeeSelector({
    contexts: [employeeFilterContext],
    modalEl: document.getElementById("employeeManagePickerModal"),
    deptTreeEl: document.getElementById("employeeManagePickerDeptList"),
    searchEl: document.getElementById("employeeManagePickerSearchInput"),
    listEl: document.getElementById("employeeManagePickerList"),
    selectedEl: document.getElementById("employeeManagePickerSelectedList"),
    selectedCountEl: document.getElementById("employeeManagePickerSelectedCount"),
    selectVisibleEl: document.getElementById("employeeManagePickerSelectVisible"),
    clearBtn: document.getElementById("employeeManagePickerClearBtn"),
    confirmBtn: document.getElementById("employeeManagePickerConfirmBtn"),
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

  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(createForm);
    const payload = {
      emp_no: fd.get("emp_no"),
      name: fd.get("name"),
      dept_name: deptNameById(deptLookupContexts.create.hiddenEl.value),
      shift_no: fd.get("shift_no"),
      is_manager: fd.get("is_manager") === "on",
      is_nursing: fd.get("is_nursing") === "on",
      employee_stats_attendance_source: fd.get("employee_stats_attendance_source"),
      manager_stats_attendance_source: fd.get("manager_stats_attendance_source"),
    };
    const res = await fetch("/admin/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      createResult.textContent = data.error || "创建失败";
      return;
    }
    createResult.textContent = "创建成功";
    createForm.reset();
    deptPicker.setValue(deptLookupContexts.create, "");
    await loadEmployees();
  });

  importForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(importForm);
    const res = await fetch("/admin/employees/import", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) {
      importResult.textContent = data.error || "导入失败";
      return;
    }
    importResult.textContent = `导入成功，处理 ${data.imported} 条`;
    importForm.reset();
    await loadEmployees();
  });

  refreshBtn.addEventListener("click", loadEmployees);

  selectAll.addEventListener("change", () => {
    const checked = selectAll.checked;
    tableBody.querySelectorAll(".employee-check").forEach((checkbox) => {
      checkbox.checked = checked;
      const id = Number(checkbox.value);
      if (checked) selectedEmployeeIds.add(id);
      else selectedEmployeeIds.delete(id);
    });
    syncSelectedCount();
  });

  clearSelectionBtn.addEventListener("click", () => {
    selectedEmployeeIds.clear();
    renderRows();
  });

  tableBody.addEventListener("change", (e) => {
    if (e.target.classList.contains("employee-check")) {
      const id = Number(e.target.value);
      if (e.target.checked) selectedEmployeeIds.add(id);
      else selectedEmployeeIds.delete(id);
      syncSelectedCount();
    }
  });

  tableBody.addEventListener("click", async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (!target.classList.contains("delete-single-btn")) return;
    const id = Number(target.dataset.id);
    if (!window.confirm("确认删除该员工吗？")) return;
    const ok = await applyBatch("delete", "", [id]);
    if (ok) {
      selectedEmployeeIds.delete(id);
      await loadEmployees();
    }
  });

  clearEmployeeFilterBtn.addEventListener("click", () => {
    employeeFilter.setValue(employeeFilterContext, []);
    renderRows();
  });

  employeeFilterContext.inputEl.addEventListener("input", renderRows);

  employeeFilterContext.quickEl.addEventListener("click", () => {
    window.setTimeout(renderRows, 0);
  });

  document.getElementById("employeeManagePickerConfirmBtn").addEventListener("click", () => {
    window.setTimeout(renderRows, 0);
  });

  applyBatchBtn.addEventListener("click", async () => {
    const ids = getSelectedIds();
    if (!ids.length) {
      window.alert("请先选择员工");
      return;
    }
    const action = batchAction.value;
    const value = batchValue.value.trim();
    if (!action) {
      window.alert("请选择批量操作");
      return;
    }
    if (action === "set_department") {
      const deptName = deptNameById(deptLookupContexts.batch.hiddenEl.value);
      if (!deptName) {
        window.alert("请选择部门");
        return;
      }
      const ok = await applyBatch("set_department", deptName, ids);
      if (!ok) return;
      resetBatchInputs();
      await loadEmployees();
      return;
    }
    if (action === "set_shift") {
      const shiftNo = batchShiftValue.value;
      if (!shiftNo) {
        window.alert("请选择班次");
        return;
      }
      const ok = await applyBatch("set_shift", shiftNo, ids);
      if (!ok) return;
      resetBatchInputs();
      await loadEmployees();
      return;
    }
    if (action === "set_manager") {
      const managerValue = batchManagerValue.value;
      if (managerValue === "") {
        window.alert("请选择人员类型");
        return;
      }
      const ok = await applyBatch("set_manager", managerValue, ids);
      if (!ok) return;
      resetBatchInputs();
      await loadEmployees();
      return;
    }
    if (action === "set_nursing") {
      const nursingValue = batchNursingValue.value;
      if (nursingValue === "") {
        window.alert("请选择哺乳假");
        return;
      }
      const ok = await applyBatch("set_nursing", nursingValue, ids);
      if (!ok) return;
      resetBatchInputs();
      await loadEmployees();
      return;
    }
    if (action === "set_employee_stats_attendance_source") {
      const sourceValue = batchEmployeeAttendanceSourceValue.value;
      if (!sourceValue) {
        window.alert("请选择员工考勤统计来源");
        return;
      }
      const ok = await applyBatch("set_employee_stats_attendance_source", sourceValue, ids);
      if (!ok) return;
      resetBatchInputs();
      await loadEmployees();
      return;
    }
    if (action === "set_manager_stats_attendance_source") {
      const sourceValue = batchManagerAttendanceSourceValue.value;
      if (!sourceValue) {
        window.alert("请选择管理人员考勤统计来源");
        return;
      }
      const ok = await applyBatch("set_manager_stats_attendance_source", sourceValue, ids);
      if (!ok) return;
      resetBatchInputs();
      await loadEmployees();
      return;
    }
    if (action !== "delete" && !value) {
      window.alert("请输入操作值");
      return;
    }
    if (action === "delete" && !window.confirm(`确认删除已选 ${ids.length} 名员工吗？`)) {
      return;
    }
    const ok = await applyBatch(action, value, ids);
    if (!ok) return;
    resetBatchInputs();
    await loadEmployees();
  });

  batchAction.addEventListener("change", () => {
    resetBatchInputs();
    syncBatchInputMode();
  });

  if (attendanceFallbackNoticeConfirmBtn) {
    attendanceFallbackNoticeConfirmBtn.addEventListener("click", () => {
      markAttendanceFallbackNoticeSeen();
      attendanceFallbackNoticeModal?.hide();
    });
  }

  if (createEmployeeAttendanceSourceSelect) {
    createEmployeeAttendanceSourceSelect.addEventListener("change", () => {
      if (createEmployeeAttendanceSourceSelect.disabled) return;
      maybeShowAttendanceFallbackNotice(createEmployeeAttendanceSourceSelect.value);
    });
  }

  if (createManagerAttendanceSourceSelect) {
    createManagerAttendanceSourceSelect.addEventListener("change", () => {
      if (createManagerAttendanceSourceSelect.disabled) return;
      maybeShowAttendanceFallbackNotice(createManagerAttendanceSourceSelect.value);
    });
  }

  if (batchEmployeeAttendanceSourceValue) {
    batchEmployeeAttendanceSourceValue.addEventListener("change", () => {
      maybeShowAttendanceFallbackNotice(batchEmployeeAttendanceSourceValue.value);
    });
  }

  if (batchManagerAttendanceSourceValue) {
    batchManagerAttendanceSourceValue.addEventListener("change", () => {
      maybeShowAttendanceFallbackNotice(batchManagerAttendanceSourceValue.value);
    });
  }

  if (createEmployeeIsManager) {
    createEmployeeIsManager.addEventListener("change", syncCreateAttendanceSourceMode);
  }

  syncCreateAttendanceSourceMode();
  syncBatchInputMode();
  Promise.all([loadShifts(), loadDepartments(), loadEmployees()]);
});
