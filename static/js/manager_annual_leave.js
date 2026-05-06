const managerMonthKeys = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"];
let annualLeaveColumnStates = {};

function showAnnualLeaveMessage(title, message) {
  const titleEl = document.getElementById("managerAnnualLeaveMessageModalTitle");
  const bodyEl = document.getElementById("managerAnnualLeaveMessageModalBody");
  const modalEl = document.getElementById("managerAnnualLeaveMessageModal");
  if (!titleEl || !bodyEl || !modalEl) return;
  titleEl.textContent = title || "提示";
  bodyEl.textContent = message || "";
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

function monthValue(value) {
  return value === null || value === undefined ? "" : value;
}

function numericInput(key, value) {
  const state = annualLeaveColumnStates[key] || "editable";
  const disabled = state === "locked" ? "disabled" : "";
  const title = state === "locked" ? 'title="该月份账套已锁定"' : (state === "missing_account_set" ? 'title="该月份暂无账套，不受封账控制"' : "");
  return `<input class="form-control form-control-sm" data-field="${key}" data-lock-state="${state}" type="text" inputmode="decimal" value="${monthValue(value)}" ${disabled} ${title}>`;
}

function monthKeyValue(year, key) {
  return `${year}-${String(Number(key.slice(1))).padStart(2, "0")}`;
}

async function monthStateMapForYear(year) {
  const res = await fetch("/admin/account-sets");
  const rows = await res.json();
  const map = {};
  managerMonthKeys.forEach((key) => {
    const month = monthKeyValue(year, key);
    const row = Array.isArray(rows) ? rows.find((item) => item.month === month) : null;
    if (!row) {
      map[key] = "missing_account_set";
    } else {
      map[key] = row.is_locked ? "locked" : "editable";
    }
  });
  return map;
}

function applyAnnualLeaveLockState(columnStates, year) {
  annualLeaveColumnStates = columnStates || {};
  const lockedMonths = [];
  const missingMonths = [];
  Object.entries(annualLeaveColumnStates).forEach(([key, state]) => {
    const month = monthKeyValue(year, key);
    if (state === "locked") lockedMonths.push(month);
    if (state === "missing_account_set") missingMonths.push(month);
  });
  const notice = document.getElementById("managerAnnualLeaveLockNotice");
  if (lockedMonths.length || missingMonths.length) {
    notice.className = "small mt-2 text-muted";
    const parts = [];
    if (lockedMonths.length) parts.push(`已锁定：${lockedMonths.join("、")}`);
    if (missingMonths.length) parts.push(`暂无账套：${missingMonths.join("、")}（仍可编辑）`);
    notice.textContent = parts.join("；");
  } else {
    notice.className = "small mt-2 text-muted";
    notice.textContent = "当前年度相关账套未锁定，可保存和导入";
  }
}

function updateAnnualLeaveMetrics(rowCount = null, status = null) {
  const year = document.getElementById("managerAnnualLeaveYear").value || String(new Date().getFullYear());
  document.getElementById("managerAnnualLeaveMetricYear").textContent = year;
  if (rowCount !== null) {
    document.getElementById("managerAnnualLeaveMetricRows").textContent = String(rowCount);
    document.getElementById("managerAnnualLeaveMetricRowsSub").textContent = rowCount ? `当前展示 ${rowCount} 人` : "当前条件无数据";
  }
  if (status !== null) {
    document.getElementById("managerAnnualLeaveMetricStatus").textContent = status;
    const metaEl = document.getElementById("managerAnnualLeaveMeta");
    if (metaEl) metaEl.textContent = status;
  }
}

function annualLeaveRowHtml(row) {
  const monthCells = managerMonthKeys.map((key) => `<td>${numericInput(key, row[key])}</td>`).join("");
  return `
    <tr data-emp-id="${row.emp_id}">
      <td>${row.dept_name || ""}</td>
      <td>${row.name || ""}</td>
      ${monthCells}
      <td>${monthValue(row.remaining)}</td>
      <td><input class="form-control form-control-sm" data-field="remark" value="${row.remark || ""}"></td>
    </tr>
  `;
}

async function loadManagerAnnualLeave() {
  const year = document.getElementById("managerAnnualLeaveYear").value;
  const query = new URLSearchParams();
  if (year) query.set("year", year);
  const [res, columnStates] = await Promise.all([
    fetch(`/admin/manager-annual-leave/records?${query.toString()}`),
    monthStateMapForYear(year),
  ]);
  const rows = await res.json();
  const body = document.getElementById("managerAnnualLeaveBody");
  if (!Array.isArray(rows) || !rows.length) {
    body.innerHTML = '<tr><td class="text-muted" colspan="16">暂无数据</td></tr>';
    applyAnnualLeaveLockState(columnStates, year);
    updateAnnualLeaveMetrics(0, "当前条件无数据");
    return;
  }
  body.innerHTML = rows.map(annualLeaveRowHtml).join("");
  applyAnnualLeaveLockState(columnStates, year);
  updateAnnualLeaveMetrics(rows.length, `共 ${rows.length} 人`);
}

async function saveManagerAnnualLeave() {
  const year = document.getElementById("managerAnnualLeaveYear").value || String(new Date().getFullYear());
  const rows = [...document.querySelectorAll("#managerAnnualLeaveBody tr[data-emp-id]")];
  const warnings = new Set();
  for (const rowEl of rows) {
    const payload = {
      emp_id: rowEl.dataset.empId,
      year,
    };
    rowEl.querySelectorAll("[data-field]").forEach((el) => {
      payload[el.dataset.field] = el.value;
    });
    const res = await fetch("/admin/manager-annual-leave/records", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showAnnualLeaveMessage("保存失败", data.error || "保存失败");
      return;
    }
    if (data.warning) warnings.add(data.warning);
  }
  if (warnings.size) {
    showAnnualLeaveMessage("部分月份未保存", [...warnings].join("\n"));
  }
  updateAnnualLeaveMetrics(rows.length, `已保存 ${rows.length} 人`);
  loadManagerAnnualLeave();
}

async function importManagerAnnualLeave() {
  const year = document.getElementById("managerAnnualLeaveYear").value || String(new Date().getFullYear());
  const fileInput = document.getElementById("managerAnnualLeaveImportFile");
  if (!fileInput.files.length) {
    showAnnualLeaveMessage("请选择文件", "请选择要导入的Excel文件");
    return;
  }
  const form = new FormData();
  form.append("year", year);
  form.append("file", fileInput.files[0]);
  const res = await fetch("/admin/manager-annual-leave/import", {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    showAnnualLeaveMessage("导入失败", data.error || "导入失败");
    return;
  }
  const warnings = data.warning ? `\n${data.warning}` : "";
  const errorText = data.error_count ? `，失败 ${data.error_count} 条：\n${data.errors.join("\n")}` : "";
  updateAnnualLeaveMetrics(data.imported || 0, `已导入 ${data.imported} 人`);
  fileInput.value = "";
  await loadManagerAnnualLeave();
  if (errorText || warnings) showAnnualLeaveMessage("导入结果", `已导入 ${data.imported} 人${warnings}${errorText}`);
}

document.addEventListener("DOMContentLoaded", () => {
  const yearInput = document.getElementById("managerAnnualLeaveYear");
  yearInput.value = String(new Date().getFullYear());
  updateAnnualLeaveMetrics(0, "等待查询");
  applyAnnualLeaveLockState({}, yearInput.value);
  yearInput.addEventListener("input", () => updateAnnualLeaveMetrics(null, "等待查询"));
  document.getElementById("managerAnnualLeaveQueryBtn").addEventListener("click", loadManagerAnnualLeave);
  document.getElementById("managerAnnualLeaveSaveBtn").addEventListener("click", saveManagerAnnualLeave);
  document.getElementById("managerAnnualLeaveImportBtn").addEventListener("click", importManagerAnnualLeave);
  document.getElementById("managerAnnualLeaveExportBtn").addEventListener("click", () => {
    const year = document.getElementById("managerAnnualLeaveYear").value || String(new Date().getFullYear());
    window.location.href = `/admin/manager-annual-leave/export?year=${encodeURIComponent(year)}`;
  });
});
