async function loadManagerAccountSets() {
  const select = document.getElementById("managerAccountSetSelect");
  const res = await fetch("/employee/api/account-sets");
  const data = await res.json();
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    select.innerHTML = `<option value="">暂无账套</option>`;
    updateManagerMetrics(null, null);
    return;
  }
  select.innerHTML = rows
    .map(
      (x) => `
        <option
          value="${x.month}"
          data-factory-rest-days="${x.factory_rest_days || 0}"
          data-monthly-benefit-days="${x.monthly_benefit_days || 0}"
          ${x.is_active ? "selected" : ""}
        >
          ${x.name}${x.is_active ? "（当前）" : ""}
        </option>
      `
    )
    .join("");
  renderAccountSetParams(rows);
  select.addEventListener("change", () => renderAccountSetParams(rows));
}

function renderAccountSetParams(rows) {
  const month = document.getElementById("managerAccountSetSelect").value;
  const row = rows.find((x) => x.month === month);
  updateManagerMetrics(row, null);
}

function updateManagerMetrics(accountSetRow = null, resultRows = null) {
  const select = document.getElementById("managerAccountSetSelect");
  const selectedOption = select.options[select.selectedIndex];
  const factoryRestDays = accountSetRow ? accountSetRow.factory_rest_days || 0 : 0;
  const benefitDays = accountSetRow ? accountSetRow.monthly_benefit_days || 0 : 0;

  document.getElementById("managerMetricAccountSet").textContent = selectedOption ? selectedOption.textContent.trim() : "未选择";
  document.getElementById("managerMetricFactoryRest").textContent = String(factoryRestDays);
  document.getElementById("managerMetricBenefitDays").textContent = String(benefitDays);

  if (resultRows === null) {
    document.getElementById("managerMetricResultRows").textContent = "0";
    document.getElementById("managerMetricResultRowsSub").textContent = "点击查询后更新";
    document.getElementById("managerQueryMeta").textContent = "等待查询";
    return;
  }

  document.getElementById("managerMetricResultRows").textContent = String(resultRows);
  document.getElementById("managerMetricResultRowsSub").textContent = resultRows ? `本次返回 ${resultRows} 条记录` : "当前条件无数据";
  document.getElementById("managerQueryMeta").textContent = resultRows ? `共返回 ${resultRows} 条记录` : "当前条件无数据";
}

function buildManagerQuery(employeeSelector = null) {
  const query = new URLSearchParams();
  const month = document.getElementById("managerAccountSetSelect").value;
  const ids = employeeSelector ? employeeSelector.getSelectedIds() : [];
  ids.forEach((id) => query.append("emp_ids", id));
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
    updateManagerMetrics(currentAccountSetRow(), 0);
    return;
  }

  body.innerHTML = rows
    .map((row) => `<tr>${headers.map((_, index) => `<td>${row[index] ?? ""}</td>`).join("")}</tr>`)
    .join("");
  updateManagerMetrics(currentAccountSetRow(), rows.length);
}

function currentAccountSetRow() {
  const select = document.getElementById("managerAccountSetSelect");
  return {
    factory_rest_days: Number(select.selectedOptions[0]?.dataset.factoryRestDays || 0),
    monthly_benefit_days: Number(select.selectedOptions[0]?.dataset.monthlyBenefitDays || 0),
  };
}

async function queryManagerAttendance(employeeSelector) {
  const query = buildManagerQuery(employeeSelector);
  const res = await fetch(`/employee/api/manager-attendance?${query.toString()}`);
  const data = await res.json();
  renderManagerRows(Array.isArray(data.headers) ? data.headers : [], Array.isArray(data.rows) ? data.rows : []);
}

document.addEventListener("DOMContentLoaded", async () => {
  const employeeSelector = window.SelectorComponent.createEmployeeSelector();
  await employeeSelector.init();
  await loadManagerAccountSets();
  document.getElementById("managerQueryBtn").addEventListener("click", () => queryManagerAttendance(employeeSelector));
  document.getElementById("managerDownloadBtn").addEventListener("click", () => {
    const query = buildManagerQuery(employeeSelector);
    window.location.href = `/employee/api/manager-attendance/export?${query.toString()}`;
  });
  document.getElementById("selectedEmpIds").addEventListener("change", () => updateManagerMetrics(currentAccountSetRow(), null));
});
