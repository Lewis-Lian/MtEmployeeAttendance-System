async function loadManagerAccountSets() {
  const select = document.getElementById("managerAccountSetSelect");
  const res = await fetch("/employee/api/account-sets");
  const data = await res.json();
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    select.innerHTML = `<option value="">暂无账套</option>`;
    return;
  }
  select.innerHTML = rows
    .map((x) => `<option value="${x.month}" ${x.is_active ? "selected" : ""}>${x.name}${x.is_active ? "（当前）" : ""}</option>`)
    .join("");
  renderAccountSetParams(rows);
  select.addEventListener("change", () => renderAccountSetParams(rows));
}

function renderAccountSetParams(rows) {
  const month = document.getElementById("managerAccountSetSelect").value;
  const row = rows.find((x) => x.month === month);
  const text = row
    ? `账套参数：本月厂休 ${row.factory_rest_days || 0} 天，本月可用福利 ${row.monthly_benefit_days || 0} 天`
    : "厂休天数和福利天数来自账套管理页面。";
  document.getElementById("managerAccountSetParams").textContent = text;
}

function buildManagerQuery() {
  const query = new URLSearchParams();
  const month = document.getElementById("managerAccountSetSelect").value;
  if (month) query.set("month", month);
  return query;
}

function renderManagerRows(headers, rows) {
  const head = document.getElementById("managerQueryHead");
  const body = document.getElementById("managerQueryBody");
  head.innerHTML = headers.length
    ? `<tr>${headers.map((header) => `<th>${header || "-"}</th>`).join("")}</tr>`
    : "<tr><th>暂无字段</th></tr>";

  if (!rows.length) {
    body.innerHTML = `<tr><td class="text-muted" colspan="${Math.max(headers.length, 1)}">暂无数据</td></tr>`;
    document.getElementById("managerQueryMeta").textContent = "当前条件无数据";
    return;
  }

  body.innerHTML = rows
    .map((row) => `<tr>${headers.map((_, index) => `<td>${row[index] ?? ""}</td>`).join("")}</tr>`)
    .join("");
  document.getElementById("managerQueryMeta").textContent = `共返回 ${rows.length} 条记录`;
}

async function queryManagerAttendance() {
  const query = buildManagerQuery();
  const res = await fetch(`/employee/api/manager-attendance?${query.toString()}`);
  const data = await res.json();
  renderManagerRows(Array.isArray(data.headers) ? data.headers : [], Array.isArray(data.rows) ? data.rows : []);
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadManagerAccountSets();
  document.getElementById("managerQueryBtn").addEventListener("click", queryManagerAttendance);
  document.getElementById("managerDownloadBtn").addEventListener("click", () => {
    const query = buildManagerQuery();
    window.location.href = `/employee/api/manager-attendance/export?${query.toString()}`;
  });
});
