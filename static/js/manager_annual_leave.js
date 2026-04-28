const managerMonthKeys = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"];

function monthValue(value) {
  return value === null || value === undefined ? "" : value;
}

function numericInput(key, value) {
  return `<input class="form-control form-control-sm" data-field="${key}" type="text" inputmode="decimal" value="${monthValue(value)}">`;
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
  const res = await fetch(`/admin/manager-annual-leave/records?${query.toString()}`);
  const rows = await res.json();
  const body = document.getElementById("managerAnnualLeaveBody");
  if (!Array.isArray(rows) || !rows.length) {
    body.innerHTML = '<tr><td class="text-muted" colspan="16">暂无数据</td></tr>';
    updateAnnualLeaveMetrics(0, "当前条件无数据");
    return;
  }
  body.innerHTML = rows.map(annualLeaveRowHtml).join("");
  updateAnnualLeaveMetrics(rows.length, `共 ${rows.length} 人`);
}

async function saveManagerAnnualLeave() {
  const year = document.getElementById("managerAnnualLeaveYear").value || String(new Date().getFullYear());
  const rows = [...document.querySelectorAll("#managerAnnualLeaveBody tr[data-emp-id]")];
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
      window.alert(data.error || "保存失败");
      return;
    }
  }
  updateAnnualLeaveMetrics(rows.length, `已保存 ${rows.length} 人`);
  loadManagerAnnualLeave();
}

async function importManagerAnnualLeave() {
  const year = document.getElementById("managerAnnualLeaveYear").value || String(new Date().getFullYear());
  const fileInput = document.getElementById("managerAnnualLeaveImportFile");
  if (!fileInput.files.length) {
    window.alert("请选择要导入的Excel文件");
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
    window.alert(data.error || "导入失败");
    return;
  }
  const errorText = data.error_count ? `，失败 ${data.error_count} 条：\n${data.errors.join("\n")}` : "";
  updateAnnualLeaveMetrics(data.imported || 0, `已导入 ${data.imported} 人`);
  fileInput.value = "";
  await loadManagerAnnualLeave();
  if (errorText) window.alert(`已导入 ${data.imported} 人${errorText}`);
}

document.addEventListener("DOMContentLoaded", () => {
  const yearInput = document.getElementById("managerAnnualLeaveYear");
  yearInput.value = String(new Date().getFullYear());
  updateAnnualLeaveMetrics(0, "等待查询");
  yearInput.addEventListener("input", () => updateAnnualLeaveMetrics(null, "等待查询"));
  document.getElementById("managerAnnualLeaveQueryBtn").addEventListener("click", loadManagerAnnualLeave);
  document.getElementById("managerAnnualLeaveSaveBtn").addEventListener("click", saveManagerAnnualLeave);
  document.getElementById("managerAnnualLeaveImportBtn").addEventListener("click", importManagerAnnualLeave);
  document.getElementById("managerAnnualLeaveExportBtn").addEventListener("click", () => {
    const year = document.getElementById("managerAnnualLeaveYear").value || String(new Date().getFullYear());
    window.location.href = `/admin/manager-annual-leave/export?year=${encodeURIComponent(year)}`;
  });
});
