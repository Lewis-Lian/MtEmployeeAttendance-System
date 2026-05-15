document.addEventListener("DOMContentLoaded", async () => {
  const accountSetSelect = document.getElementById("managerHomeAccountSetSelect");
  const refreshBtn = document.getElementById("managerHomeRefreshBtn");
  const summaryEl = document.getElementById("managerHomeSummary");
  const emptyEl = document.getElementById("managerHomeEmptyState");

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function formatDays(value) {
    const num = Number(value || 0);
    return Number.isInteger(num) ? `${num}` : `${num.toFixed(2)}`;
  }

  function showEmpty(title, message, accountSetName = "未选择") {
    summaryEl.classList.add("d-none");
    emptyEl.classList.remove("d-none");
    setText("managerHomeAccountSetName", accountSetName || "未选择");
    setText("managerHomeEmptyTitle", title || "暂无可展示数据");
    setText("managerHomeEmptyMessage", message || "请稍后重试");
  }

  function showSummary(payload) {
    summaryEl.classList.remove("d-none");
    emptyEl.classList.add("d-none");
    setText("managerHomeAccountSetName", payload.account_set_name || "未选择");
    setText("managerHomeName", payload.manager?.name || "-");
    setText(
      "managerHomeMeta",
      `${payload.month || "-"} · ${payload.manager?.dept_name || "未分配部门"} · ${payload.manager?.emp_no || "-"}`
    );
    setText("managerHomeAttendanceDays", formatDays(payload.summary?.attendance_days));
    setText("managerHomeLateMinutes", formatDays(payload.summary?.late_early_minutes));
    setText("managerHomeBenefitDays", formatDays(payload.summary?.benefit_days));
    setText("managerHomeOvertimeRemaining", formatDays(payload.summary?.overtime_remaining_days));
    setText("managerHomePersonalSickDays", formatDays(payload.summary?.personal_sick_days));
    setText("managerHomeInjuryDays", formatDays(payload.summary?.injury_days));
    setText("managerHomeBusinessTripDays", formatDays(payload.summary?.business_trip_days));
    setText("managerHomeMarriageDays", formatDays(payload.summary?.marriage_days));
    setText("managerHomeFuneralDays", formatDays(payload.summary?.funeral_days));
    setText("managerHomeSupportMessage", payload.support_message || "如对考勤数据有疑问，请联系信息中心协助核对处理。");
  }

  async function loadAccountSets() {
    const res = await fetch("/employee/api/account-sets");
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) {
      accountSetSelect.innerHTML = `<option value="">暂无账套</option>`;
      showEmpty("暂无账套", "当前没有可选账套，暂无数据。", "暂无账套");
      return [];
    }

    accountSetSelect.innerHTML = rows
      .map(
        (row) => `
          <option value="${row.month}" ${row.is_active ? "selected" : ""}>
            ${row.name}${row.is_active ? "（当前）" : ""}
          </option>
        `
      )
      .join("");
    return rows;
  }

  async function refreshSummary() {
    const month = (accountSetSelect.value || "").trim();
    if (!month) {
      showEmpty("暂无账套", "当前没有可选账套，暂无数据。", "暂无账套");
      return;
    }

    const res = await fetch(`/employee/api/home-manager-summary?month=${encodeURIComponent(month)}`);
    const payload = await res.json();
    if (!res.ok) {
      showEmpty("加载失败", payload.error || "首页数据加载失败", "");
      return;
    }
    if (!payload.has_data) {
      showEmpty("暂无数据", payload.empty_state || "当前条件下暂无数据", payload.account_set_name || "未选择");
      return;
    }
    showSummary(payload);
  }

  await loadAccountSets();
  accountSetSelect.addEventListener("change", refreshSummary);
  refreshBtn.addEventListener("click", refreshSummary);
  await refreshSummary();
});
