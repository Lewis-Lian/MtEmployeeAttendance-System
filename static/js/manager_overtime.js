const managerMonthKeys = ["prev_dec", "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"];
let overtimeColumnStates = {};

function showOvertimeMessage(title, message) {
  const titleEl = document.getElementById("managerOvertimeMessageModalTitle");
  const bodyEl = document.getElementById("managerOvertimeMessageModalBody");
  const modalEl = document.getElementById("managerOvertimeMessageModal");
  if (!titleEl || !bodyEl || !modalEl) return;
  titleEl.textContent = title || "提示";
  bodyEl.textContent = message || "";
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

function monthValue(value) {
  return value === null || value === undefined ? "" : value;
}

function numericInput(key, value) {
  const state = overtimeColumnStates[key] || "editable";
  const disabled = state === "locked" ? "disabled" : "";
  const title = state === "locked" ? 'title="该月份账套已锁定"' : (state === "missing_account_set" ? 'title="该月份暂无账套，不受封账控制"' : "");
  return `<input class="form-control form-control-sm" data-field="${key}" data-lock-state="${state}" type="text" inputmode="decimal" value="${monthValue(value)}" ${disabled} ${title}>`;
}

function monthKeyValue(year, key) {
  if (key === "prev_dec") return `${Number(year) - 1}-12`;
  return `${year}-${String(Number(key.slice(1))).padStart(2, "0")}`;
}

async function monthStateMapForYear(year, includePrevDec = false) {
  const res = await fetch("/admin/account-sets");
  const rows = await res.json();
  const map = {};
  const keys = includePrevDec ? managerMonthKeys : managerMonthKeys.filter((key) => key !== "prev_dec");
  keys.forEach((key) => {
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

function applyOvertimeLockState(columnStates, year) {
  overtimeColumnStates = columnStates || {};
  const lockedMonths = [];
  const missingMonths = [];
  Object.entries(overtimeColumnStates).forEach(([key, state]) => {
    const month = monthKeyValue(year, key);
    if (state === "locked") lockedMonths.push(month);
    if (state === "missing_account_set") missingMonths.push(month);
  });
  const notice = document.getElementById("managerOvertimeLockNotice");
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

function updateOvertimeMetrics(rowCount = null, status = null) {
  const year = document.getElementById("managerOvertimeYear").value || String(new Date().getFullYear());
  document.getElementById("managerOvertimeMetricYear").textContent = year;
  if (rowCount !== null) {
    document.getElementById("managerOvertimeMetricRows").textContent = String(rowCount);
    document.getElementById("managerOvertimeMetricRowsSub").textContent = rowCount ? `当前展示 ${rowCount} 人` : "当前条件无数据";
  }
  if (status !== null) {
    document.getElementById("managerOvertimeMetricStatus").textContent = status;
    const metaEl = document.getElementById("managerOvertimeMeta");
    if (metaEl) metaEl.textContent = status;
  }
}

function overtimeRowHtml(row) {
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

async function loadManagerOvertime() {
  const year = document.getElementById("managerOvertimeYear").value;
  const query = new URLSearchParams();
  if (year) query.set("year", year);
  const [res, columnStates] = await Promise.all([
    fetch(`/admin/manager-overtime/records?${query.toString()}`),
    monthStateMapForYear(year, true),
  ]);
  const rows = await res.json();
  const body = document.getElementById("managerOvertimeBody");
  if (!Array.isArray(rows) || !rows.length) {
    body.innerHTML = '<tr><td class="text-muted" colspan="17">暂无数据</td></tr>';
    applyOvertimeLockState(columnStates, year);
    updateOvertimeMetrics(0, "当前条件无数据");
    return;
  }
  body.innerHTML = rows.map(overtimeRowHtml).join("");
  applyOvertimeLockState(columnStates, year);
  updateOvertimeMetrics(rows.length, `共 ${rows.length} 人`);
}

async function saveManagerOvertime() {
  const year = document.getElementById("managerOvertimeYear").value || String(new Date().getFullYear());
  const rows = [...document.querySelectorAll("#managerOvertimeBody tr[data-emp-id]")];
  const warnings = new Set();
  for (const rowEl of rows) {
    const payload = {
      emp_id: rowEl.dataset.empId,
      year,
    };
    rowEl.querySelectorAll("[data-field]").forEach((el) => {
      payload[el.dataset.field] = el.value;
    });
    const res = await fetch("/admin/manager-overtime/records", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showOvertimeMessage("保存失败", data.error || "保存失败");
      return;
    }
    if (data.warning) warnings.add(data.warning);
  }
  if (warnings.size) {
    showOvertimeMessage("部分月份未保存", [...warnings].join("\n"));
  }
  updateOvertimeMetrics(rows.length, `已保存 ${rows.length} 人`);
  loadManagerOvertime();
}

async function importManagerOvertime() {
  const year = document.getElementById("managerOvertimeYear").value || String(new Date().getFullYear());
  const fileInput = document.getElementById("managerOvertimeImportFile");
  if (!fileInput.files.length) {
    showOvertimeMessage("请选择文件", "请选择要导入的Excel文件");
    return;
  }
  const form = new FormData();
  form.append("year", year);
  form.append("file", fileInput.files[0]);
  const res = await fetch("/admin/manager-overtime/import", {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    showOvertimeMessage("导入失败", data.error || "导入失败");
    return;
  }
  const warnings = data.warning ? `\n${data.warning}` : "";
  const errorText = data.error_count ? `，失败 ${data.error_count} 条：\n${data.errors.join("\n")}` : "";
  updateOvertimeMetrics(data.imported || 0, `已导入 ${data.imported} 人`);
  fileInput.value = "";
  await loadManagerOvertime();
  if (errorText || warnings) showOvertimeMessage("导入结果", `已导入 ${data.imported} 人${warnings}${errorText}`);
}

document.addEventListener("DOMContentLoaded", () => {
  const yearInput = document.getElementById("managerOvertimeYear");
  yearInput.value = String(new Date().getFullYear());
  updateOvertimeMetrics(0, "等待查询");
  applyOvertimeLockState({}, yearInput.value);
  yearInput.addEventListener("input", () => updateOvertimeMetrics(null, "等待查询"));
  document.getElementById("managerOvertimeQueryBtn").addEventListener("click", loadManagerOvertime);
  document.getElementById("managerOvertimeSaveBtn").addEventListener("click", saveManagerOvertime);
  document.getElementById("managerOvertimeImportBtn").addEventListener("click", importManagerOvertime);
  document.getElementById("managerOvertimeExportBtn").addEventListener("click", () => {
    const year = document.getElementById("managerOvertimeYear").value || String(new Date().getFullYear());
    window.location.href = `/admin/manager-overtime/export?year=${encodeURIComponent(year)}`;
  });
});
