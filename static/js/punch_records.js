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
  const body = document.getElementById("punchTableBody");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="12" class="text-muted">暂无数据</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td>${r.date || ""}</td>
        <td>${r.emp_no || ""}</td>
        <td>${r.name || ""}</td>
        <td>${r.dept_name || ""}</td>
        <td class="col-raw-punch">${r.raw_punch_data || ""}</td>
        <td class="col-inout-punch">${r.check_in_times || ""}</td>
        <td class="col-inout-punch">${r.check_out_times || ""}</td>
        <td>${r.punch_count ?? 0}</td>
        <td>${r.actual_hours ?? 0}</td>
        <td>${r.late_minutes ?? 0}</td>
        <td>${r.early_leave_minutes ?? 0}</td>
        <td>${r.exception_reason || ""}</td>
      </tr>
    `
    )
    .join("");
  applyColumnVisibility();
}

function applyColumnVisibility() {
  const showRaw = document.getElementById("toggleRawPunch").checked;
  const showInOut = document.getElementById("toggleInOutPunch").checked;
  document.querySelectorAll(".col-raw-punch").forEach((el) => {
    el.style.display = showRaw ? "" : "none";
  });
  document.querySelectorAll(".col-inout-punch").forEach((el) => {
    el.style.display = showInOut ? "" : "none";
  });
}

function buildQuery(employeeSelector) {
  const month = document.getElementById("accountSetSelect").value;
  const ids = employeeSelector.getSelectedIds();
  const query = new URLSearchParams();
  if (month) query.set("month", month);
  ids.forEach((id) => query.append("emp_ids", id));
  return { query, selectedCount: ids.length };
}

async function queryPunchRecords(employeeSelector) {
  const { query, selectedCount } = buildQuery(employeeSelector);
  if (!selectedCount) {
    renderRows([]);
    return;
  }
  const res = await fetch(`/employee/api/punch-records?${query.toString()}`);
  const data = await res.json();
  renderRows(Array.isArray(data) ? data : []);
}

document.addEventListener("DOMContentLoaded", async () => {
  const employeeSelector = window.SelectorComponent.createEmployeeSelector();
  await loadAccountSets();
  await employeeSelector.init();

  document.getElementById("queryBtn").addEventListener("click", () => queryPunchRecords(employeeSelector));
  document.getElementById("downloadBtn").addEventListener("click", () => {
    const { query, selectedCount } = buildQuery(employeeSelector);
    if (!selectedCount) {
      window.alert("请先选择员工");
      return;
    }
    window.location.href = `/employee/api/punch-records/export?${query.toString()}`;
  });
  document.getElementById("toggleRawPunch").addEventListener("change", applyColumnVisibility);
  document.getElementById("toggleInOutPunch").addEventListener("change", applyColumnVisibility);

  applyColumnVisibility();
  renderRows([]);
});
