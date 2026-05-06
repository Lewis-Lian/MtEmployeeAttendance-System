function buildFinalDataQuery(employeeSelector) {
  const month = document.getElementById("accountSetSelect").value;
  const ids = employeeSelector.getSelectedIds();
  const showLeaveCounts = document.getElementById("showLeaveCounts").checked;
  const showLeaveDurations = document.getElementById("showLeaveDurations").checked;
  const query = new URLSearchParams();
  ids.forEach((id) => query.append("emp_ids", id));
  if (month) query.set("month", month);
  if (showLeaveCounts) query.set("show_leave_counts", "1");
  if (showLeaveDurations) query.set("show_leave_durations", "1");
  return { query, selectedCount: ids.length };
}

function updateDashboardMetrics(employeeSelector, resultRows = null) {
  const ids = employeeSelector.getSelectedIds();
  const accountSetSelect = document.getElementById("accountSetSelect");
  const selectedOption = accountSetSelect.options[accountSetSelect.selectedIndex];
  const showLeaveCounts = document.getElementById("showLeaveCounts").checked;
  const showLeaveDurations = document.getElementById("showLeaveDurations").checked;

  document.getElementById("metricSelectedEmployees").textContent = String(ids.length);
  document.getElementById("metricSelectedEmployeesSub").textContent = ids.length ? `当前已选 ${ids.length} 人` : "当前未选择员工";
  document.getElementById("metricAccountSet").textContent = selectedOption ? selectedOption.textContent.trim() : "未选择";

  const modeParts = [];
  if (showLeaveCounts) modeParts.push("请假次数");
  if (showLeaveDurations) modeParts.push("请假时长");
  document.getElementById("metricColumnMode").textContent = modeParts.length ? modeParts.join(" + ") : "基础字段";
  document.getElementById("metricColumnModeSub").textContent = modeParts.length
    ? `已启用 ${modeParts.length} 组扩展列`
    : "未显示请假次数和时长";

  if (resultRows === null) {
    document.getElementById("metricResultRows").textContent = "0";
    document.getElementById("metricResultRowsSub").textContent = "点击查询后更新";
    document.getElementById("finalDataMeta").textContent = "等待查询";
    return;
  }

  document.getElementById("metricResultRows").textContent = String(resultRows);
  document.getElementById("metricResultRowsSub").textContent = resultRows ? `本次返回 ${resultRows} 条记录` : "当前条件无数据";
  document.getElementById("finalDataMeta").textContent = resultRows ? `共返回 ${resultRows} 条记录` : "当前条件无数据";
}

async function loadFinalData(employeeSelector) {
  const { query, selectedCount } = buildFinalDataQuery(employeeSelector);
  if (!selectedCount) {
    document.getElementById("finalDataHead").innerHTML = "<tr><th>暂无数据</th></tr>";
    document.getElementById("finalDataBody").innerHTML = '<tr><td class="text-muted">请先选择员工</td></tr>';
    updateDashboardMetrics(employeeSelector, 0);
    return;
  }

  const res = await fetch(`/employee/api/final-data?${query.toString()}`);
  const data = await res.json();
  const headers = Array.isArray(data.headers) ? data.headers : [];
  const rows = Array.isArray(data.rows) ? data.rows : [];

  document.getElementById("finalDataHead").innerHTML = headers.length
    ? `<tr>${headers.map((h) => `<th>${h || "-"}</th>`).join("")}</tr>`
    : "<tr><th>无可展示字段</th></tr>";

  if (!rows.length) {
    document.getElementById("finalDataBody").innerHTML = `<tr><td class="text-muted" colspan="${Math.max(headers.length, 1)}">暂无数据</td></tr>`;
    updateDashboardMetrics(employeeSelector, 0);
    return;
  }

  document.getElementById("finalDataBody").innerHTML = rows
    .map((row) => `<tr>${headers.map((_, i) => `<td>${row[i] ?? ""}</td>`).join("")}</tr>`)
    .join("");
  updateDashboardMetrics(employeeSelector, rows.length);
}

function setFinalDataIdleState() {
  document.getElementById("finalDataHead").innerHTML = "<tr><th>暂无数据</th></tr>";
  document.getElementById("finalDataBody").innerHTML = '<tr><td class="text-muted">请点击查询</td></tr>';
  document.getElementById("finalDataMeta").textContent = "等待查询";
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

document.addEventListener("DOMContentLoaded", async () => {
  const employeeSelector = window.SelectorComponent.createEmployeeSelector();
  await employeeSelector.init();

  document.getElementById("refreshBtn").addEventListener("click", () => loadFinalData(employeeSelector));
  document.getElementById("downloadBtn").addEventListener("click", () => {
    const { query, selectedCount } = buildFinalDataQuery(employeeSelector);
    if (!selectedCount) {
      window.AppDialog.alert("请先选择员工");
      return;
    }
    window.location.href = `/employee/api/final-data/export?${query.toString()}`;
  });

  document.getElementById("accountSetSelect").addEventListener("change", () => updateDashboardMetrics(employeeSelector, null));
  document.getElementById("showLeaveCounts").addEventListener("change", () => updateDashboardMetrics(employeeSelector, null));
  document.getElementById("showLeaveDurations").addEventListener("change", () => updateDashboardMetrics(employeeSelector, null));
  document.getElementById("selectedEmpIds").addEventListener("change", () => updateDashboardMetrics(employeeSelector, null));

  setFinalDataIdleState();
  await loadAccountSets();
  updateDashboardMetrics(employeeSelector, null);
});
