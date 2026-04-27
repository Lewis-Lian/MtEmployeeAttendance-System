function buildQuery(employeeSelector) {
  const month = document.getElementById("accountSetSelect").value;
  const ids = employeeSelector.getSelectedIds();
  const query = new URLSearchParams();
  if (month) query.set("month", month);
  ids.forEach((id) => query.append("emp_ids", id));
  return { query, selectedCount: ids.length };
}

function updateAbnormalMetrics(employeeSelector, rows = null) {
  const ids = employeeSelector.getSelectedIds();
  const accountSetSelect = document.getElementById("accountSetSelect");
  const selectedOption = accountSetSelect.options[accountSetSelect.selectedIndex];

  document.getElementById("metricSelectedEmployees").textContent = String(ids.length);
  document.getElementById("metricSelectedEmployeesSub").textContent = ids.length ? `当前已选 ${ids.length} 人` : "当前未选择员工";
  document.getElementById("metricAccountSet").textContent = selectedOption ? selectedOption.textContent.trim() : "未选择";

  if (!Array.isArray(rows)) {
    document.getElementById("metricAbnormalTotal").textContent = "0";
    document.getElementById("metricAbnormalTotalSub").textContent = "点击查询后更新";
    document.getElementById("metricResultRows").textContent = "0";
    document.getElementById("metricResultRowsSub").textContent = "点击查询后更新";
    document.getElementById("abnormalMeta").textContent = "等待查询";
    return;
  }

  const total = rows.reduce((sum, row) => sum + Number(row.abnormal_count || 0), 0);
  document.getElementById("metricAbnormalTotal").textContent = String(total);
  document.getElementById("metricAbnormalTotalSub").textContent = total ? `本次累计 ${total} 次异常` : "当前条件无异常记录";
  document.getElementById("metricResultRows").textContent = String(rows.length);
  document.getElementById("metricResultRowsSub").textContent = rows.length ? `本次返回 ${rows.length} 条记录` : "当前条件无数据";
  document.getElementById("abnormalMeta").textContent = rows.length ? `共返回 ${rows.length} 条记录` : "当前条件无数据";
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
    updateAbnormalMetrics(employeeSelector, []);
    return;
  }
  const res = await fetch(`/employee/api/abnormal-attendance?${query.toString()}`);
  const data = await res.json();
  const rows = Array.isArray(data) ? data : [];
  renderRows(rows);
  updateAbnormalMetrics(employeeSelector, rows);
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

  document.getElementById("accountSetSelect").addEventListener("change", () => updateAbnormalMetrics(employeeSelector, null));
  document.getElementById("selectedEmpIds").addEventListener("change", () => updateAbnormalMetrics(employeeSelector, null));

  renderRows([]);
  document.getElementById("abnormalMeta").textContent = "等待查询";
  await loadAccountSets();
  updateAbnormalMetrics(employeeSelector, null);
});
