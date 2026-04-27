function buildQuery(employeeSelector) {
  const month = document.getElementById("accountSetSelect").value;
  const ids = employeeSelector.getSelectedIds();
  const query = new URLSearchParams();
  if (month) query.set("month", month);
  ids.forEach((id) => query.append("emp_ids", id));
  return { query, selectedCount: ids.length };
}

function renderRows(rows) {
  const body = document.getElementById("abnormalTableBody");
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="4" class="text-muted">暂无数据</td></tr>';
    return;
  }
  body.innerHTML = rows
    .map(
      (r) => `
        <tr>
          <td>${r.dept_name || ""}</td>
          <td>${r.emp_no || ""}</td>
          <td>${r.name || ""}</td>
          <td>${r.abnormal_count ?? 0}</td>
        </tr>
      `
    )
    .join("");
}

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

async function queryAbnormalData(employeeSelector) {
  const { query, selectedCount } = buildQuery(employeeSelector);
  if (!selectedCount) {
    renderRows([]);
    return;
  }
  const res = await fetch(`/employee/api/abnormal-attendance?${query.toString()}`);
  const data = await res.json();
  renderRows(Array.isArray(data) ? data : []);
}

document.addEventListener("DOMContentLoaded", async () => {
  const employeeSelector = window.SelectorComponent.createEmployeeSelector();
  await employeeSelector.init();

  document.getElementById("queryBtn").addEventListener("click", () => queryAbnormalData(employeeSelector));
  document.getElementById("downloadBtn").addEventListener("click", () => {
    const { query, selectedCount } = buildQuery(employeeSelector);
    if (!selectedCount) {
      window.alert("请先选择员工");
      return;
    }
    window.location.href = `/employee/api/abnormal-attendance/export?${query.toString()}`;
  });

  renderRows([]);
  loadAccountSets();
});
