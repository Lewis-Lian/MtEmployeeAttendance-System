const employeeAttendanceOverrideFields = [
  ["attendance_days", "考勤天数"],
  ["work_hours", "工时"],
  ["half_days", "半勤天数"],
  ["late_early_minutes", "迟到\\早退"],
];

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "" : String(value);
}

async function accountSetLockState(month) {
  const query = new URLSearchParams();
  if (month) query.set("month", month);
  const res = await fetch(`/admin/account-sets?${query.toString()}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) return null;
  return rows.find((row) => row.month === month) || null;
}

function applyEmployeeOverrideLockState(accountSet) {
  const locked = Boolean(accountSet?.is_locked);
  document.getElementById("employeeAttendanceOverrideSaveBtn").disabled = locked;
  document.getElementById("employeeAttendanceOverrideClearBtn").disabled = locked;
  document.getElementById("employeeAttendanceOverrideImportBtn").disabled = locked;
  document.querySelectorAll("#employeeAttendanceOverrideBody [data-field]").forEach((input) => {
    input.disabled = locked;
  });
  const notice = document.getElementById("employeeAttendanceOverrideLockNotice");
  notice.className = `small mt-2 ${locked ? "text-danger" : "text-muted"}`;
  notice.textContent = locked
    ? `${accountSet.month} 账套已锁定，当前仅可查看`
    : "当前月份未锁定，可保存或清空修正";
}

function updateEmployeeMetrics(status = null, data = null) {
  const month = document.getElementById("employeeAttendanceOverrideMonth").value || "-";
  const selectedIds = selectedEmployeeIds();
  const employeeText = document.getElementById("empSearchInput").value || "未选择";
  document.getElementById("employeeAttendanceOverrideMetricMonth").textContent = month || "-";
  document.getElementById("employeeAttendanceOverrideMetricEmployee").textContent = selectedIds.length
    ? employeeText
    : "未选择";
  if (status !== null) {
    document.getElementById("employeeAttendanceOverrideMetricStatus").textContent = status;
  }
  if (data?.override?.updated_at) {
    const userLabel = data.override.updated_by_name ? `${data.override.updated_by_name} ` : "";
    document.getElementById("employeeAttendanceOverrideUpdatedAt").textContent =
      `最近保存 ${userLabel}${data.override.updated_at.replace("T", " ").slice(0, 19)}`;
  } else if (data) {
    document.getElementById("employeeAttendanceOverrideUpdatedAt").textContent = "未保存";
  }
}

function renderEmployeeHistory(rows) {
  const wrap = document.getElementById("employeeAttendanceOverrideHistory");
  if (!Array.isArray(rows) || !rows.length) {
    wrap.innerHTML = '<div class="text-muted small">当前账套月份暂无修正记录</div>';
    return;
  }
  wrap.innerHTML = rows
    .map((row) => {
      const changes = Array.isArray(row.changes)
        ? row.changes
            .map((item) => `${item.label}：${displayValue(item.before)} → ${displayValue(item.after)}`)
            .join("<br>")
        : "";
      const sourceText = row.source_file_name ? `导入：${row.source_file_name}` : "手工操作";
      const actionMap = { manual_save: "保存", clear: "清空", import: "导入" };
      return `
        <div class="override-history-item">
          <div class="override-history-meta">
            <span>${row.created_at ? row.created_at.replace("T", " ").slice(0, 19) : ""}</span>
            <span>${row.emp_no || ""} ${row.employee_name || ""}</span>
            <span>${row.operator_name || "未知用户"}</span>
            <span>${actionMap[row.action_type] || row.action_type}</span>
            <span>${sourceText}</span>
          </div>
          <div class="override-history-remark">${row.remark || "无备注"}</div>
          <div class="override-history-changes small">${changes || "无字段变化摘要"}</div>
        </div>
      `;
    })
    .join("");
}

function selectedEmployeeIds() {
  const value = document.getElementById("selectedEmpIds").value.trim();
  if (!value) return [];
  const seen = new Set();
  return value.split(",").map((id) => id.trim()).filter((id) => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function renderEmployeeRows(data) {
  const body = document.getElementById("employeeAttendanceOverrideBody");
  body.innerHTML = employeeAttendanceOverrideFields
    .map(([key, label]) => {
      const automaticValue = data.automatic?.[key];
      const overrideValue = data.override?.[key];
      const appliedValue = data.applied?.[key];
      const inputMode = ["half_days", "late_early_minutes"].includes(key) ? "numeric" : "decimal";
      return `
        <tr>
          <td>${label}</td>
          <td>${displayValue(automaticValue)}</td>
          <td><input class="form-control form-control-sm" data-field="${key}" inputmode="${inputMode}" value="${displayValue(overrideValue)}" placeholder="自动"></td>
          <td>${displayValue(appliedValue)}</td>
        </tr>
      `;
    })
    .join("");
  document.getElementById("employeeAttendanceOverrideRemark").value = data.override?.remark || "";
}

function selectedQuery() {
  const month = document.getElementById("employeeAttendanceOverrideMonth").value;
  const ids = selectedEmployeeIds();
  const empId = ids[0];
  if (!month || !empId) {
    window.AppDialog.alert("请选择月份和员工");
    return null;
  }
  if (ids.length > 1) {
    window.AppDialog.alert("员工考勤修正一次只能维护一名员工，请只选择一个人");
    return null;
  }
  return { month, empId };
}

async function loadEmployeeAttendanceOverride() {
  const selected = selectedQuery();
  if (!selected) return;
  const query = new URLSearchParams({ month: selected.month, emp_id: selected.empId });
  const [res, accountSet] = await Promise.all([
    fetch(`/admin/employee-attendance-overrides/record?${query.toString()}`),
    accountSetLockState(selected.month),
  ]);
  const data = await res.json();
  if (!res.ok) {
    window.AppDialog.alert(data.error || "查询失败", "查询失败");
    return;
  }
  renderEmployeeRows(data);
  renderEmployeeHistory(data.history || []);
  applyEmployeeOverrideLockState(accountSet);
  updateEmployeeMetrics("已查询", data);
}

async function saveEmployeeAttendanceOverride() {
  const selected = selectedQuery();
  if (!selected) return;
  const payload = {
    month: selected.month,
    emp_id: selected.empId,
    remark: document.getElementById("employeeAttendanceOverrideRemark").value,
  };
  document.querySelectorAll("#employeeAttendanceOverrideBody [data-field]").forEach((input) => {
    payload[input.dataset.field] = input.value;
  });
  const res = await fetch("/admin/employee-attendance-overrides/record", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    window.AppDialog.alert(data.error || "保存失败", "保存失败");
    return;
  }
  renderEmployeeRows(data);
  renderEmployeeHistory(data.history || []);
  updateEmployeeMetrics("已保存", data);
}

async function clearEmployeeAttendanceOverride() {
  const selected = selectedQuery();
  if (!selected) return;
  const query = new URLSearchParams({ month: selected.month, emp_id: selected.empId });
  const res = await fetch(`/admin/employee-attendance-overrides/record?${query.toString()}`, {
    method: "DELETE",
  });
  const data = await res.json();
  if (!res.ok) {
    window.AppDialog.alert(data.error || "清空失败", "清空失败");
    return;
  }
  renderEmployeeRows(data);
  renderEmployeeHistory(data.history || []);
  updateEmployeeMetrics("已清空", data);
}

function selectedMonthOnly() {
  const month = document.getElementById("employeeAttendanceOverrideMonth").value;
  if (!month) {
    window.AppDialog.alert("请选择月份");
    return null;
  }
  return month;
}

function downloadEmployeeOverrideFile(type) {
  const month = selectedMonthOnly();
  if (!month) return;
  window.location.href = `/admin/employee-attendance-overrides/${type}?month=${encodeURIComponent(month)}`;
}

async function importEmployeeAttendanceOverride(file) {
  const month = selectedMonthOnly();
  if (!month || !file) return;
  const form = new FormData();
  form.append("month", month);
  form.append("file", file);
  const res = await fetch("/admin/employee-attendance-overrides/import", {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    window.AppDialog.alert(data.error || "导入失败", "导入失败");
    return;
  }
  const summary = [
    `成功 ${data.success_count} 条`,
    `跳过 ${data.skipped_count} 条`,
    `失败 ${data.failed_count} 条`,
    `实际变更 ${data.changed_count} 条`,
  ];
  if (Array.isArray(data.errors) && data.errors.length) {
    summary.push("", data.errors.join("\n"));
  }
  window.AppDialog.alert(summary.join("\n"), "导入结果");
}

document.addEventListener("DOMContentLoaded", async () => {
  const employeeSelector = window.SelectorComponent.createEmployeeSelector();
  const monthInput = document.getElementById("employeeAttendanceOverrideMonth");
  const fileInput = document.getElementById("employeeAttendanceOverrideFileInput");
  if (!monthInput.value) {
    monthInput.value = currentMonthValue();
  }
  await employeeSelector.init();
  updateEmployeeMetrics("等待查询");
  applyEmployeeOverrideLockState(null);
  monthInput.addEventListener("input", () => updateEmployeeMetrics("等待查询"));
  document
    .getElementById("selectedEmpIds")
    .addEventListener("change", () => updateEmployeeMetrics("等待查询"));
  document
    .getElementById("employeeAttendanceOverrideQueryBtn")
    .addEventListener("click", loadEmployeeAttendanceOverride);
  document
    .getElementById("employeeAttendanceOverrideSaveBtn")
    .addEventListener("click", saveEmployeeAttendanceOverride);
  document
    .getElementById("employeeAttendanceOverrideClearBtn")
    .addEventListener("click", clearEmployeeAttendanceOverride);
  document
    .getElementById("employeeAttendanceOverrideExportBtn")
    .addEventListener("click", () => downloadEmployeeOverrideFile("export"));
  document
    .getElementById("employeeAttendanceOverrideTemplateBtn")
    .addEventListener("click", () => downloadEmployeeOverrideFile("template"));
  document
    .getElementById("employeeAttendanceOverrideImportBtn")
    .addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    await importEmployeeAttendanceOverride(file);
    fileInput.value = "";
  });
});
