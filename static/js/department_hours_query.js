async function loadAccountSets() {
  const select = document.getElementById("accountSetSelect");
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
}

function renderRows(rows) {
  const body = document.getElementById("departmentHoursBody");
  if (!rows.length) {
    body.innerHTML = '<tr><td class="text-muted" colspan="2">暂无数据</td></tr>';
    return;
  }
  const totalHours = rows.reduce((sum, row) => sum + Number(row.total_hours || 0), 0);
  body.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>${row.dept_name || ""}</td>
        <td>${row.total_hours ?? 0}</td>
      </tr>
    `
    )
    .join("");
  body.innerHTML += `
    <tr class="table-primary">
      <td><strong>总计工时</strong></td>
      <td><strong>${totalHours.toFixed(2)}</strong></td>
    </tr>
  `;
}

async function queryDepartmentHours() {
  const month = document.getElementById("accountSetSelect").value;
  const query = new URLSearchParams();
  if (month) query.set("month", month);
  const res = await fetch(`/employee/api/department-hours?${query.toString()}`);
  const data = await res.json();
  renderRows(Array.isArray(data) ? data : []);
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadAccountSets();
  document.getElementById("queryBtn").addEventListener("click", queryDepartmentHours);
  document.getElementById("downloadBtn").addEventListener("click", () => {
    const month = document.getElementById("accountSetSelect").value;
    const query = new URLSearchParams();
    if (month) query.set("month", month);
    window.location.href = `/employee/api/department-hours/export?${query.toString()}`;
  });
});
