const managerMonthKeys = ["prev_dec", "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"];

function monthValue(value) {
  return value === null || value === undefined ? "" : value;
}

function numericInput(key, value) {
  return `<input class="form-control form-control-sm" data-field="${key}" type="text" inputmode="decimal" value="${monthValue(value)}">`;
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
  const res = await fetch(`/admin/manager-overtime/records?${query.toString()}`);
  const rows = await res.json();
  const body = document.getElementById("managerOvertimeBody");
  if (!Array.isArray(rows) || !rows.length) {
    body.innerHTML = '<tr><td class="text-muted" colspan="17">暂无数据</td></tr>';
    updateOvertimeMetrics(0, "当前条件无数据");
    return;
  }
  body.innerHTML = rows.map(overtimeRowHtml).join("");
  updateOvertimeMetrics(rows.length, `共 ${rows.length} 人`);
}

async function saveManagerOvertime() {
  const year = document.getElementById("managerOvertimeYear").value || String(new Date().getFullYear());
  const rows = [...document.querySelectorAll("#managerOvertimeBody tr[data-emp-id]")];
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
      window.alert(data.error || "保存失败");
      return;
    }
  }
  updateOvertimeMetrics(rows.length, `已保存 ${rows.length} 人`);
  loadManagerOvertime();
}

async function importManagerOvertime() {
  const year = document.getElementById("managerOvertimeYear").value || String(new Date().getFullYear());
  const fileInput = document.getElementById("managerOvertimeImportFile");
  if (!fileInput.files.length) {
    window.alert("请选择要导入的Excel文件");
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
    window.alert(data.error || "导入失败");
    return;
  }
  const errorText = data.error_count ? `，失败 ${data.error_count} 条：\n${data.errors.join("\n")}` : "";
  updateOvertimeMetrics(data.imported || 0, `已导入 ${data.imported} 人`);
  fileInput.value = "";
  await loadManagerOvertime();
  if (errorText) window.alert(`已导入 ${data.imported} 人${errorText}`);
}

document.addEventListener("DOMContentLoaded", () => {
  const yearInput = document.getElementById("managerOvertimeYear");
  yearInput.value = String(new Date().getFullYear());
  updateOvertimeMetrics(0, "等待查询");
  yearInput.addEventListener("input", () => updateOvertimeMetrics(null, "等待查询"));
  document.getElementById("managerOvertimeQueryBtn").addEventListener("click", loadManagerOvertime);
  document.getElementById("managerOvertimeSaveBtn").addEventListener("click", saveManagerOvertime);
  document.getElementById("managerOvertimeImportBtn").addEventListener("click", importManagerOvertime);
  document.getElementById("managerOvertimeExportBtn").addEventListener("click", () => {
    const year = document.getElementById("managerOvertimeYear").value || String(new Date().getFullYear());
    window.location.href = `/admin/manager-overtime/export?year=${encodeURIComponent(year)}`;
  });
});
