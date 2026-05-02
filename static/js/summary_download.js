const FINAL_HEADERS = [
  "部门名称", "人员编号", "人员名称", "考勤天数",
  "病假（次数）", "工伤（次数）", "丧假（次数）", "事假（次数）",
  "补休（调休）(次)", "婚假（次）",
  "病假时长（天）", "工伤时长（天）", "丧假时长（天）", "事假时长（天）",
  "补休（调休）(天)", "婚假（天）",
  "工时", "半勤天数", "备注",
];

const PUNCH_HEADERS = [
  "日期", "员工编号", "员工姓名", "部门", "原始打卡数据",
  "上班打卡", "下班打卡", "打卡次数", "实出勤小时",
  "迟到分钟", "早退分钟", "异常原因",
];

function renderHeaderCheckboxes() {
  function buildGroup(headers, containerId, prefix, uncheckedHeaders) {
    const container = document.getElementById(containerId);
    container.innerHTML = headers
      .map(
        (h) => {
          const checked = uncheckedHeaders && uncheckedHeaders.has(h) ? "" : "checked";
          return `
        <label class="badge text-bg-light border p-2 d-inline-flex align-items-center gap-1" style="cursor:pointer">
          <input class="form-check-input m-0" type="checkbox" ${checked} data-header-group="${prefix}" value="${h}">
          ${h}
        </label>
      `;
        }
      )
      .join("");
  }

  buildGroup(FINAL_HEADERS, "finalHeaderCheckboxes", "final", null);
  buildGroup(PUNCH_HEADERS, "punchHeaderCheckboxes", "punch",
    new Set(["上班打卡", "下班打卡", "迟到分钟", "早退分钟", "异常原因"]));
}

function getSelectedHeaders(prefix) {
  return Array.from(
    document.querySelectorAll(`input[data-header-group="${prefix}"]:checked`)
  ).map((cb) => cb.value);
}

function toggleAllHeaders(prefix) {
  const checkboxes = document.querySelectorAll(`input[data-header-group="${prefix}"]`);
  const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
  checkboxes.forEach((cb) => (cb.checked = !allChecked));
}

function buildDownloadQuery(employeeSelector) {
  const month = document.getElementById("accountSetSelect").value;
  const ids = employeeSelector.getSelectedIds();
  const query = new URLSearchParams();
  ids.forEach((id) => query.append("emp_ids", id));
  if (month) query.set("month", month);
  query.set("final_headers", getSelectedHeaders("final").join(","));
  query.set("punch_headers", getSelectedHeaders("punch").join(","));
  return { query, selectedCount: ids.length };
}

function updateDownloadMetrics(employeeSelector) {
  const ids = employeeSelector.getSelectedIds();
  const accountSetSelect = document.getElementById("accountSetSelect");
  const selectedOption = accountSetSelect.options[accountSetSelect.selectedIndex];

  document.getElementById("metricSelectedEmployees").textContent = String(ids.length);
  document.getElementById("metricSelectedEmployeesSub").textContent =
    ids.length ? `当前已选 ${ids.length} 人` : "当前未选择员工";
  document.getElementById("metricAccountSet").textContent = selectedOption
    ? selectedOption.textContent.trim()
    : "-";
  document.getElementById("metricDownloadStatus").textContent = "等待操作";
}

function getSelectedSheets() {
  const sheets = [];
  if (document.getElementById("includeFinalData").checked) sheets.push("final");
  if (document.getElementById("includePunchRecords").checked) sheets.push("punch");
  return sheets;
}

async function doDownload(employeeSelector) {
  const { query, selectedCount } = buildDownloadQuery(employeeSelector);
  if (!selectedCount) {
    window.alert("请先选择员工");
    return;
  }
  const sheets = getSelectedSheets();
  if (!sheets.length) {
    window.alert("请至少选择一种报表");
    return;
  }
  query.set("sheets", sheets.join(","));
  document.getElementById("metricDownloadStatus").textContent = "正在下载...";
  window.location.href = `/employee/api/summary-download/export?${query.toString()}`;
  setTimeout(() => {
    document.getElementById("metricDownloadStatus").textContent = "下载完成";
  }, 1500);
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
    .map(
      (x) =>
        `<option value="${x.month}" ${x.is_active ? "selected" : ""}>${x.name}${x.is_active ? "（当前）" : ""}</option>`
    )
    .join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  renderHeaderCheckboxes();

  document.getElementById("toggleAllFinalHeaders").addEventListener("click", () => toggleAllHeaders("final"));
  document.getElementById("toggleAllPunchHeaders").addEventListener("click", () => toggleAllHeaders("punch"));

  const employeeSelector = window.SelectorComponent.createEmployeeSelector();
  await employeeSelector.init();

  document.getElementById("downloadBtn").addEventListener("click", () => doDownload(employeeSelector));

  document.getElementById("accountSetSelect").addEventListener("change", () => updateDownloadMetrics(employeeSelector));
  document.getElementById("selectedEmpIds").addEventListener("change", () => updateDownloadMetrics(employeeSelector));

  await loadAccountSets();
  updateDownloadMetrics(employeeSelector);
});
