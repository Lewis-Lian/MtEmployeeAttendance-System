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
    document.getElementById("employeeAttendanceOverrideUpdatedAt").textContent =
      `最近保存 ${data.override.updated_at.replace("T", " ").slice(0, 19)}`;
  } else if (data) {
    document.getElementById("employeeAttendanceOverrideUpdatedAt").textContent = "未保存";
  }
}

function selectedEmployeeIds() {
  const value = document.getElementById("selectedEmpIds").value.trim();
  return value ? value.split(",").map((id) => id.trim()).filter(Boolean) : [];
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
  updateEmployeeMetrics("已清空", data);
}

document.addEventListener("DOMContentLoaded", async () => {
  const employeeSelector = window.SelectorComponent.createEmployeeSelector();
  const monthInput = document.getElementById("employeeAttendanceOverrideMonth");
  monthInput.value = currentMonthValue();
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
});
