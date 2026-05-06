const managerAttendanceOverrideFields = [
  ["attendance_days", "出勤天数"],
  ["injury_days", "工伤"],
  ["business_trip_days", "出差"],
  ["marriage_days", "婚假"],
  ["funeral_days", "丧假"],
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

function applyManagerOverrideLockState(accountSet) {
  const locked = Boolean(accountSet?.is_locked);
  document.getElementById("managerAttendanceOverrideSaveBtn").disabled = locked;
  document.getElementById("managerAttendanceOverrideClearBtn").disabled = locked;
  document.querySelectorAll("#managerAttendanceOverrideBody [data-field]").forEach((input) => {
    input.disabled = locked;
  });
  const notice = document.getElementById("managerAttendanceOverrideLockNotice");
  notice.className = `small mt-2 ${locked ? "text-danger" : "text-muted"}`;
  notice.textContent = locked
    ? `${accountSet.month} 账套已锁定，当前仅可查看`
    : "当前月份未锁定，可保存或清空修正";
}

function updateAttendanceOverrideMetrics(status = null, data = null) {
  const month = document.getElementById("managerAttendanceOverrideMonth").value || "-";
  const selectedIds = selectedManagerIds();
  const employeeText = document.getElementById("empSearchInput").value || "未选择";
  document.getElementById("managerAttendanceOverrideMetricMonth").textContent = month || "-";
  document.getElementById("managerAttendanceOverrideMetricEmployee").textContent = selectedIds.length
    ? employeeText
    : "未选择";
  if (status !== null) {
    document.getElementById("managerAttendanceOverrideMetricStatus").textContent = status;
  }
  if (data?.override?.updated_at) {
    document.getElementById("managerAttendanceOverrideUpdatedAt").textContent =
      `最近保存 ${data.override.updated_at.replace("T", " ").slice(0, 19)}`;
  } else if (data) {
    document.getElementById("managerAttendanceOverrideUpdatedAt").textContent = "未保存";
  }
}

function selectedManagerIds() {
  const value = document.getElementById("selectedEmpIds").value.trim();
  return value ? value.split(",").map((id) => id.trim()).filter(Boolean) : [];
}

function renderAttendanceOverrideRows(data) {
  const body = document.getElementById("managerAttendanceOverrideBody");
  body.innerHTML = managerAttendanceOverrideFields
    .map(([key, label]) => {
      const automaticValue = data.automatic?.[key];
      const overrideValue = data.override?.[key];
      const appliedValue = data.applied?.[key];
      const inputMode = key === "late_early_minutes" ? "numeric" : "decimal";
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
  document.getElementById("managerAttendanceOverrideRemark").value = data.override?.remark || "";
}

function selectedQuery() {
  const month = document.getElementById("managerAttendanceOverrideMonth").value;
  const ids = selectedManagerIds();
  const empId = ids[0];
  if (!month || !empId) {
    window.AppDialog.alert("请选择月份和管理人员");
    return null;
  }
  if (ids.length > 1) {
    window.AppDialog.alert("考勤修正一次只能维护一名管理人员，请只选择一个人");
    return null;
  }
  return { month, empId };
}

async function loadManagerAttendanceOverride() {
  const selected = selectedQuery();
  if (!selected) return;
  const query = new URLSearchParams({ month: selected.month, emp_id: selected.empId });
  const [res, accountSet] = await Promise.all([
    fetch(`/admin/manager-attendance-overrides/record?${query.toString()}`),
    accountSetLockState(selected.month),
  ]);
  const data = await res.json();
  if (!res.ok) {
    window.AppDialog.alert(data.error || "查询失败", "查询失败");
    return;
  }
  renderAttendanceOverrideRows(data);
  applyManagerOverrideLockState(accountSet);
  updateAttendanceOverrideMetrics("已查询", data);
}

async function saveManagerAttendanceOverride() {
  const selected = selectedQuery();
  if (!selected) return;
  const payload = {
    month: selected.month,
    emp_id: selected.empId,
    remark: document.getElementById("managerAttendanceOverrideRemark").value,
  };
  document.querySelectorAll("#managerAttendanceOverrideBody [data-field]").forEach((input) => {
    payload[input.dataset.field] = input.value;
  });
  const res = await fetch("/admin/manager-attendance-overrides/record", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    window.AppDialog.alert(data.error || "保存失败", "保存失败");
    return;
  }
  renderAttendanceOverrideRows(data);
  updateAttendanceOverrideMetrics("已保存", data);
}

async function clearManagerAttendanceOverride() {
  const selected = selectedQuery();
  if (!selected) return;
  const query = new URLSearchParams({ month: selected.month, emp_id: selected.empId });
  const res = await fetch(`/admin/manager-attendance-overrides/record?${query.toString()}`, {
    method: "DELETE",
  });
  const data = await res.json();
  if (!res.ok) {
    window.AppDialog.alert(data.error || "清空失败", "清空失败");
    return;
  }
  renderAttendanceOverrideRows(data);
  updateAttendanceOverrideMetrics("已清空", data);
}

document.addEventListener("DOMContentLoaded", async () => {
  const employeeSelector = window.SelectorComponent.createEmployeeSelector();
  const monthInput = document.getElementById("managerAttendanceOverrideMonth");
  monthInput.value = currentMonthValue();
  await employeeSelector.init();
  updateAttendanceOverrideMetrics("等待查询");
  applyManagerOverrideLockState(null);
  monthInput.addEventListener("input", () => updateAttendanceOverrideMetrics("等待查询"));
  document
    .getElementById("selectedEmpIds")
    .addEventListener("change", () => updateAttendanceOverrideMetrics("等待查询"));
  document
    .getElementById("managerAttendanceOverrideQueryBtn")
    .addEventListener("click", loadManagerAttendanceOverride);
  document
    .getElementById("managerAttendanceOverrideSaveBtn")
    .addEventListener("click", saveManagerAttendanceOverride);
  document
    .getElementById("managerAttendanceOverrideClearBtn")
    .addEventListener("click", clearManagerAttendanceOverride);
});
