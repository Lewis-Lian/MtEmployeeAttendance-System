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
  const batchAction = document.getElementById("batchAction");
  const batchValue = document.getElementById("batchValue");
  const batchShiftValue = document.getElementById("batchShiftValue");
  const batchDeptInlineLookup = document.getElementById("batchDeptInlineLookup");
  const applyBatchBtn = document.getElementById("applyBatchBtn");
  const createShiftSelect = createForm.querySelector('[name="shift_no"]');

  let employees = [];
  let shifts = [];
  let departments = [];

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

  function getSelectedIds() {
    return Array.from(tableBody.querySelectorAll(".employee-check:checked")).map((x) => Number(x.value));
  }

  function syncSelectedCount() {
    selectedCount.textContent = `已选 ${getSelectedIds().length} 人`;
  }

  function renderRows() {
    tableBody.innerHTML = "";
    for (const employee of employees) {
      const shiftText = employee.shift_no ? `${employee.shift_no} - ${employee.shift_name || ""}` : "-";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="checkbox" class="employee-check" value="${employee.id}"></td>
        <td>${employee.id}</td>
        <td>${employee.emp_no}</td>
        <td>${employee.name}</td>
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
  }

  async function applyBatch(action, value, ids) {
    const payload = { action, ids };
    if (action === "set_name") payload.name = value;
    if (action === "set_emp_no") payload.emp_no = value;
    if (action === "set_department") payload.dept_name = value;
    if (action === "set_shift") payload.shift_no = value;

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
    deptPicker.setValue(deptLookupContexts.batch, "");
  }

  function syncBatchInputMode() {
    const action = batchAction.value;
    batchValue.classList.toggle("d-none", action === "set_department" || action === "set_shift");
    batchShiftValue.classList.toggle("d-none", action !== "set_shift");
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

  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(createForm);
    const payload = {
      emp_no: fd.get("emp_no"),
      name: fd.get("name"),
      dept_name: deptNameById(deptLookupContexts.create.hiddenEl.value),
      shift_no: fd.get("shift_no"),
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
    });
    syncSelectedCount();
  });

  clearSelectionBtn.addEventListener("click", () => {
    tableBody.querySelectorAll(".employee-check").forEach((checkbox) => {
      checkbox.checked = false;
    });
    selectAll.checked = false;
    syncSelectedCount();
  });

  tableBody.addEventListener("change", (e) => {
    if (e.target.classList.contains("employee-check")) {
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
    if (ok) await loadEmployees();
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

  syncBatchInputMode();
  Promise.all([loadShifts(), loadDepartments(), loadEmployees()]);
});
