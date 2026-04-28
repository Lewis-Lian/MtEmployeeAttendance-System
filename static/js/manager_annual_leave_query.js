const annualLeaveQueryKeys = ["dept_name", "name", "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12", "remaining", "remark"];

function annualLeaveQueryValue(value) {
  return value === null || value === undefined ? "" : value;
}

function updateAnnualLeaveQueryMetrics(rowCount = null, status = null) {
  const year = document.getElementById("managerAnnualLeaveQueryYear").value || String(new Date().getFullYear());
  document.getElementById("managerAnnualLeaveQueryMetricYear").textContent = year;
  if (rowCount !== null) {
    document.getElementById("managerAnnualLeaveQueryMetricRows").textContent = String(rowCount);
    document.getElementById("managerAnnualLeaveQueryMetricRowsSub").textContent = rowCount ? `当前展示 ${rowCount} 人` : "当前条件无数据";
  }
  if (status !== null) {
    document.getElementById("managerAnnualLeaveQueryMetricStatus").textContent = status;
    document.getElementById("managerAnnualLeaveQueryMeta").textContent = status;
  }
}

function renderAnnualLeaveQuery(headers, rows) {
  const head = document.getElementById("managerAnnualLeaveQueryHead");
  const body = document.getElementById("managerAnnualLeaveQueryBody");
  head.innerHTML = headers.length
    ? `<tr>${headers.map((header) => `<th>${header || "-"}</th>`).join("")}</tr>`
    : "<tr><th>暂无字段</th></tr>";

  if (!rows.length) {
    body.innerHTML = `<tr><td class="text-muted" colspan="${Math.max(headers.length, 1)}">暂无数据</td></tr>`;
    updateAnnualLeaveQueryMetrics(0, "当前条件无数据");
    return;
  }

  body.innerHTML = rows
    .map((row) => `<tr>${annualLeaveQueryKeys.map((key) => `<td>${annualLeaveQueryValue(row[key])}</td>`).join("")}</tr>`)
    .join("");
  updateAnnualLeaveQueryMetrics(rows.length, `共 ${rows.length} 人`);
}

async function loadAnnualLeaveQuery() {
  const year = document.getElementById("managerAnnualLeaveQueryYear").value;
  const ids = annualLeaveEmployeeSelector.getSelectedIds();
  const query = new URLSearchParams();
  if (year) query.set("year", year);
  ids.forEach((id) => query.append("emp_ids", id));
  const res = await fetch(`/employee/api/manager-annual-leave-query?${query.toString()}`);
  const data = await res.json();
  renderAnnualLeaveQuery(Array.isArray(data.headers) ? data.headers : [], Array.isArray(data.rows) ? data.rows : []);
}

let annualLeaveEmployeeSelector;

document.addEventListener("DOMContentLoaded", async () => {
  annualLeaveEmployeeSelector = window.SelectorComponent.createEmployeeSelector();
  await annualLeaveEmployeeSelector.init();
  const yearInput = document.getElementById("managerAnnualLeaveQueryYear");
  yearInput.value = String(new Date().getFullYear());
  updateAnnualLeaveQueryMetrics(0, "等待查询");
  yearInput.addEventListener("input", () => updateAnnualLeaveQueryMetrics(null, "等待查询"));
  document.getElementById("selectedEmpIds").addEventListener("change", () => updateAnnualLeaveQueryMetrics(null, "等待查询"));
  document.getElementById("managerAnnualLeaveQueryBtn").addEventListener("click", loadAnnualLeaveQuery);
});
