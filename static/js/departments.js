document.addEventListener("DOMContentLoaded", () => {
  const createForm = document.getElementById("createDeptForm");
  const importForm = document.getElementById("importDeptForm");
  const createResult = document.getElementById("createDeptResult");
  const importResult = document.getElementById("deptImportResult");
  const tableBody = document.getElementById("deptTableBody");
  const exportBtn = document.getElementById("exportDeptBtn");
  const refreshBtn = document.getElementById("refreshDeptBtn");
  const selectAll = document.getElementById("selectAllDepts");
  const selectedCount = document.getElementById("deptSelectedCount");
  const batchActionSelect = document.getElementById("batchDeptActionSelect");
  const applyBatchActionBtn = document.getElementById("applyBatchDeptActionBtn");
  const deleteUnboundBtn = document.getElementById("deleteUnboundDeptsBtn");
  const editForm = document.getElementById("editDeptForm");
  const saveBtn = document.getElementById("saveDeptBtn");
  const editModal = new bootstrap.Modal(document.getElementById("editDeptModal"));
  const batchParentHint = document.getElementById("batchParentDeptHint");
  const batchParentModal = new bootstrap.Modal(document.getElementById("batchParentDeptModal"));
  const confirmBatchParentBtn = document.getElementById("confirmBatchParentDeptBtn");

  let departments = [];
  window.AppFeedback.setResult(createResult, "", "muted");
  window.AppFeedback.setResult(importResult, "", "muted");

  function getSelectedIds() {
    return Array.from(tableBody.querySelectorAll(".dept-check:checked")).map((x) => Number(x.value));
  }

  function syncSelectedCount() {
    selectedCount.textContent = `已选 ${getSelectedIds().length} 项`;
  }

  function renderRows() {
    tableBody.innerHTML = "";
    for (const dept of departments) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="checkbox" class="dept-check" value="${dept.id}"></td>
        <td>${dept.id}</td>
        <td>${dept.dept_no}</td>
        <td>${dept.dept_name}</td>
        <td>${dept.parent_name || "-"}</td>
        <td>${dept.is_locked ? "是" : "否"}</td>
        <td class="d-flex gap-1">
          <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${dept.id}">编辑</button>
          <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${dept.id}">删除</button>
        </td>
      `;
      tableBody.appendChild(tr);
    }
    syncSelectedCount();
  }

  async function loadDepartments() {
    const res = await fetch("/admin/departments");
    const data = await res.json();
    departments = Array.isArray(data) ? data : [];
    renderRows();
    parentPicker.refresh();
  }

  async function deleteDepartments(ids) {
    const res = await fetch("/admin/departments/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", ids }),
    });
    const data = await res.json();
    if (!res.ok) {
      window.AppDialog.alert(data.error || "删除失败", "删除失败");
      return false;
    }
    return true;
  }

  async function setDepartmentsParent(ids, parentId) {
    const res = await fetch("/admin/departments/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_parent", ids, parent_id: parentId || null }),
    });
    const data = await res.json();
    if (!res.ok) {
      window.AppDialog.alert(data.error || "更新失败", "更新失败");
      return false;
    }
    return true;
  }

  async function setDepartmentsLocked(ids, locked) {
    const res = await fetch("/admin/departments/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: locked ? "lock" : "unlock", ids }),
    });
    const data = await res.json();
    if (!res.ok) {
      window.AppDialog.alert(data.error || "更新失败", "更新失败");
      return false;
    }
    return true;
  }

  const lookupContexts = {
    create: {
      key: "create",
      lookupEl: document.getElementById("createDeptParentLookup"),
      inputEl: document.getElementById("createDeptParentInput"),
      hiddenEl: document.getElementById("createDeptParentId"),
      triggerEl: document.getElementById("openCreateDeptParentPickerBtn"),
      quickEl: document.getElementById("createDeptParentQuickList"),
    },
    edit: {
      key: "edit",
      lookupEl: document.getElementById("editDeptParentLookup"),
      inputEl: document.getElementById("editDeptParentInput"),
      hiddenEl: document.getElementById("editDeptParentId"),
      triggerEl: document.getElementById("openEditDeptParentPickerBtn"),
      quickEl: document.getElementById("editDeptParentQuickList"),
    },
    batch: {
      key: "batch",
      lookupEl: document.getElementById("batchDeptParentLookup"),
      inputEl: document.getElementById("batchParentDeptInput"),
      hiddenEl: document.getElementById("batchParentDeptId"),
      triggerEl: document.getElementById("openBatchDeptParentPickerBtn"),
      quickEl: document.getElementById("batchParentDeptQuickList"),
    },
  };

  function getExcludedIds(ctx) {
    if (!ctx) return new Set();
    if (ctx.key === "edit") {
      const editId = Number(editForm.querySelector('[name="id"]').value || 0);
      return editId ? new Set([editId]) : new Set();
    }
    if (ctx.key === "batch") {
      return new Set(getSelectedIds().map((id) => Number(id)));
    }
    return new Set();
  }

  const parentPicker = window.SelectorComponent.createSingleSelectTreeLookup({
    contexts: Object.values(lookupContexts),
    getEntities: () => departments,
    getExcludedIds,
    getId: (x) => x.id,
    getParentId: (x) => x.parent_id,
    getName: (x) => x.dept_name || "",
    getCode: (x) => x.dept_no || "",
    emptyLabel: "无（顶级部门）",
    emptySelectedHtml: `<div class="employee-selected-empty">未选择（顶级部门）</div>`,
    modalEl: document.getElementById("departmentPickerModal"),
    treeEl: document.getElementById("departmentPickerTree"),
    searchEl: document.getElementById("departmentPickerSearchInput"),
    selectedEl: document.getElementById("departmentPickerSelectedList"),
    confirmBtn: document.getElementById("departmentPickerConfirmBtn"),
    clearBtn: document.getElementById("departmentPickerClearBtn"),
  });

  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(createForm);
    const payload = {
      dept_no: fd.get("dept_no"),
      dept_name: fd.get("dept_name"),
      parent_id: fd.get("parent_id") || null,
      is_locked: fd.get("is_locked") === "on",
    };
    const res = await fetch("/admin/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      window.AppFeedback.setResult(createResult, data.error || "创建失败", "danger");
      window.AppToast.error(data.error || "创建失败", "创建部门失败");
      return;
    }
    window.AppFeedback.setResult(createResult, "创建成功", "success");
    window.AppToast.success("创建成功", "创建部门成功");
    createForm.reset();
    parentPicker.setValue(lookupContexts.create, "");
    await loadDepartments();
  });

  importForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(importForm);
    const res = await fetch("/admin/departments/import", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) {
      window.AppFeedback.setResult(importResult, data.error || "导入失败", "danger");
      window.AppToast.error(data.error || "导入失败", "导入部门失败");
      return;
    }
    window.AppFeedback.setResult(importResult, `导入成功，处理 ${data.imported} 条`, "success");
    window.AppToast.success(`导入成功，处理 ${data.imported} 条`, "导入部门成功");
    importForm.reset();
    await loadDepartments();
  });

  tableBody.addEventListener("change", (e) => {
    if (e.target.classList.contains("dept-check")) syncSelectedCount();
  });

  selectAll.addEventListener("change", () => {
    const checked = selectAll.checked;
    tableBody.querySelectorAll(".dept-check").forEach((checkbox) => {
      checkbox.checked = checked;
    });
    syncSelectedCount();
  });

  applyBatchActionBtn.addEventListener("click", async () => {
    const ids = getSelectedIds();
    if (!ids.length) {
      window.AppDialog.alert("请先选择部门");
      return;
    }
    const action = batchActionSelect.value;
    if (!action) {
      window.AppDialog.alert("请选择批量操作");
      return;
    }

    if (action === "delete") {
      if (!(await window.AppDialog.confirm(`确认删除已选 ${ids.length} 个部门吗`, "批量删除部门"))) return;
      const ok = await deleteDepartments(ids);
      if (!ok) return;
      selectAll.checked = false;
      batchActionSelect.value = "";
      await loadDepartments();
      return;
    }

    if (action === "lock" || action === "unlock") {
      const ok = await setDepartmentsLocked(ids, action === "lock");
      if (!ok) return;
      selectAll.checked = false;
      batchActionSelect.value = "";
      await loadDepartments();
      return;
    }

    batchParentHint.textContent = `将应用到已选 ${ids.length} 个部门。`;
    parentPicker.setValue(lookupContexts.batch, "");
    batchParentModal.show();
  });

  confirmBatchParentBtn.addEventListener("click", async () => {
    const ids = getSelectedIds();
    if (!ids.length) {
      window.AppDialog.alert("请先选择部门");
      return;
    }
    const ok = await setDepartmentsParent(ids, lookupContexts.batch.hiddenEl.value);
    if (!ok) return;
    batchParentModal.hide();
    selectAll.checked = false;
    batchActionSelect.value = "";
    await loadDepartments();
  });

  deleteUnboundBtn.addEventListener("click", async () => {
    if (!(await window.AppDialog.confirm("确认一键删除未绑定员工的部门吗？", "删除未绑定部门"))) return;
    const res = await fetch("/admin/departments/delete-unbound", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      window.AppDialog.alert(data.error || "操作失败", "操作失败");
      return;
    }
    window.AppDialog.alert(
      `处理完成：删除 ${data.deleted || 0} 个，` +
      `跳过锁定部门 ${data.skipped_locked || 0} 个，` +
      `跳过已绑定员工 ${data.skipped_employee_bound || 0} 个，` +
      `跳过已绑定账号权限 ${data.skipped_account_bound || 0} 个`,
      "处理完成"
    );
    selectAll.checked = false;
    await loadDepartments();
  });

  tableBody.addEventListener("click", async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const id = Number(target.dataset.id);
    const dept = departments.find((x) => x.id === id);
    if (!dept) return;

    if (target.classList.contains("edit-btn")) {
      editForm.querySelector('[name="id"]').value = String(dept.id);
      editForm.querySelector('[name="dept_no"]').value = dept.dept_no;
      editForm.querySelector('[name="dept_name"]').value = dept.dept_name;
      editForm.querySelector('[name="is_locked"]').checked = Boolean(dept.is_locked);
      parentPicker.setValue(lookupContexts.edit, dept.parent_id || "");
      editModal.show();
      return;
    }

    if (target.classList.contains("delete-btn")) {
      if (!(await window.AppDialog.confirm(`确认删除部门 ${dept.dept_name} 吗`, "删除部门"))) return;
      const ok = await deleteDepartments([dept.id]);
      if (!ok) return;
      await loadDepartments();
    }
  });

  saveBtn.addEventListener("click", async () => {
    const id = Number(editForm.querySelector('[name="id"]').value);
    const payload = {
      dept_no: editForm.querySelector('[name="dept_no"]').value,
      dept_name: editForm.querySelector('[name="dept_name"]').value,
      parent_id: editForm.querySelector('[name="parent_id"]').value || null,
      is_locked: editForm.querySelector('[name="is_locked"]').checked,
    };
    const res = await fetch(`/admin/departments/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      window.AppDialog.alert(data.error || "更新失败", "更新失败");
      return;
    }
    editModal.hide();
    await loadDepartments();
  });

  exportBtn.addEventListener("click", () => {
    window.location.href = "/admin/departments/export";
  });
  refreshBtn.addEventListener("click", loadDepartments);
  loadDepartments();
});
