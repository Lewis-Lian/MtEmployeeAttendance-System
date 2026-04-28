const overtimeQueryKeys = ["dept_name", "name", "prev_dec", "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12", "remaining", "remark"];

function overtimeQueryValue(value) {
  return value === null || value === undefined ? "" : value;
}

function updateOvertimeQueryMetrics(rowCount = null, status = null) {
  const year = document.getElementById("managerOvertimeQueryYear").value || String(new Date().getFullYear());
  document.getElementById("managerOvertimeQueryMetricYear").textContent = year;
  if (rowCount !== null) {
    document.getElementById("managerOvertimeQueryMetricRows").textContent = String(rowCount);
    document.getElementById("managerOvertimeQueryMetricRowsSub").textContent = rowCount ? `当前展示 ${rowCount} 人` : "当前条件无数据";
  }
  if (status !== null) {
    document.getElementById("managerOvertimeQueryMetricStatus").textContent = status;
    document.getElementById("managerOvertimeQueryMeta").textContent = status;
  }
}

function renderOvertimeQuery(headers, rows) {
  const head = document.getElementById("managerOvertimeQueryHead");
  const body = document.getElementById("managerOvertimeQueryBody");
  head.innerHTML = headers.length
    ? `<tr>${headers.map((header) => `<th>${header || "-"}</th>`).join("")}</tr>`
    : "<tr><th>暂无字段</th></tr>";

  if (!rows.length) {
    body.innerHTML = `<tr><td class="text-muted" colspan="${Math.max(headers.length, 1)}">暂无数据</td></tr>`;
    updateOvertimeQueryMetrics(0, "当前条件无数据");
    return;
  }

  body.innerHTML = rows
    .map((row) => `<tr>${overtimeQueryKeys.map((key) => `<td>${overtimeQueryValue(row[key])}</td>`).join("")}</tr>`)
    .join("");
  updateOvertimeQueryMetrics(rows.length, `共 ${rows.length} 人`);
}

async function loadOvertimeQuery() {
  const year = document.getElementById("managerOvertimeQueryYear").value;
  const ids = overtimeEmployeeSelector.getSelectedIds();
  const query = new URLSearchParams();
  if (year) query.set("year", year);
  ids.forEach((id) => query.append("emp_ids", id));
  const res = await fetch(`/employee/api/manager-overtime-query?${query.toString()}`);
  const data = await res.json();
  renderOvertimeQuery(Array.isArray(data.headers) ? data.headers : [], Array.isArray(data.rows) ? data.rows : []);
}

let overtimeEmployeeSelector;

document.addEventListener("DOMContentLoaded", async () => {
  overtimeEmployeeSelector = window.SelectorComponent.createEmployeeSelector();
  await overtimeEmployeeSelector.init();
  const yearInput = document.getElementById("managerOvertimeQueryYear");
  yearInput.value = String(new Date().getFullYear());
  updateOvertimeQueryMetrics(0, "等待查询");
  yearInput.addEventListener("input", () => updateOvertimeQueryMetrics(null, "等待查询"));
  document.getElementById("selectedEmpIds").addEventListener("change", () => updateOvertimeQueryMetrics(null, "等待查询"));
  document.getElementById("managerOvertimeQueryBtn").addEventListener("click", loadOvertimeQuery);
});
