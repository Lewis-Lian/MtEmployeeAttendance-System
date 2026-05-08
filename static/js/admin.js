document.addEventListener("DOMContentLoaded", () => {
  const importRawForm = document.getElementById("importRawForm");
  const importRawBtn = document.getElementById("importRawBtn");
  const calculateEmployeeBtn = document.getElementById("calculateEmployeeBtn");
  const calculateManagerBtn = document.getElementById("calculateManagerBtn");
  const createAccountSetForm = document.getElementById("createAccountSetForm");
  const accountSetSelect = document.getElementById("accountSetSelect");
  const factoryRestDaysInput = document.getElementById("factoryRestDaysInput");
  const monthlyBenefitDaysInput = document.getElementById("monthlyBenefitDaysInput");
  const saveAccountSetParamsBtn = document.getElementById("saveAccountSetParamsBtn");
  const activateAccountSetBtn = document.getElementById("activateAccountSetBtn");
  const lockAccountSetBtn = document.getElementById("lockAccountSetBtn");
  const unlockAccountSetBtn = document.getElementById("unlockAccountSetBtn");
  const deleteAccountSetBtn = document.getElementById("deleteAccountSetBtn");
  const refreshAccountSetsBtn = document.getElementById("refreshAccountSetsBtn");
  const accountSetResult = document.getElementById("accountSetResult");
  const accountSetImportsBody = document.getElementById("accountSetImportsBody");
  const accountSetLockNotice = document.getElementById("accountSetLockNotice");

  let accountSets = [];
  window.AppFeedback.setResult(accountSetResult, "", "muted");

  function currentAccountSetId() {
    return Number(accountSetSelect.value || 0);
  }

  function currentAccountSet() {
    const id = currentAccountSetId();
    return accountSets.find((x) => Number(x.id) === id) || null;
  }

  function renderAccountSetParams() {
    const row = currentAccountSet();
    factoryRestDaysInput.value = row ? String(row.factory_rest_days || 0) : "0";
    monthlyBenefitDaysInput.value = row ? String(row.monthly_benefit_days || 0) : "0";
    const isLocked = Boolean(row?.is_locked);
    factoryRestDaysInput.disabled = isLocked;
    monthlyBenefitDaysInput.disabled = isLocked;
    saveAccountSetParamsBtn.disabled = isLocked || !row;
    deleteAccountSetBtn.disabled = isLocked || !row;
    importRawBtn.disabled = isLocked || !row;
    calculateEmployeeBtn.disabled = isLocked || !row;
    calculateManagerBtn.disabled = isLocked || !row;
    lockAccountSetBtn.disabled = !row || isLocked;
    unlockAccountSetBtn.disabled = !row || !isLocked;
    accountSetLockNotice.className = `small mb-2 ${isLocked ? "text-danger" : "text-muted"}`;
    accountSetLockNotice.textContent = !row
      ? "请选择账套"
      : (isLocked ? "该账套已锁定，仅允许查看、设为当前和解锁。" : "该账套未锁定，可继续上传、计算和修改。");
  }

  function renderAccountSets() {
    if (!accountSets.length) {
      accountSetSelect.innerHTML = `<option value="">暂无账套，请先创建</option>`;
      renderAccountSetParams();
      return;
    }
    accountSetSelect.innerHTML = accountSets
      .map(
        (x) =>
          `<option value="${x.id}" ${x.is_active ? "selected" : ""}>${x.name}${x.is_active ? "（当前）" : ""} [待计算${x.pending_count || 0}]</option>`
      )
      .join("");
    renderAccountSetParams();
  }

  function renderImports(rows) {
    if (!rows.length) {
      accountSetImportsBody.innerHTML = `<tr><td colspan="6" class="text-muted">暂无导入记录</td></tr>`;
      return;
    }
    accountSetImportsBody.innerHTML = rows
      .map((r) => {
        const statusText = r.status === "ok" ? "成功" : (r.status === "uploaded" ? "待计算" : "失败");
        const statusClass = r.status === "ok" ? "text-success" : (r.status === "uploaded" ? "text-warning" : "text-danger");
        return `
          <tr>
            <td>${(r.created_at || "").replace("T", " ").slice(0, 19)}</td>
            <td>${r.source_filename || "-"}</td>
            <td>${r.file_type || "-"}</td>
            <td class="${statusClass}">${statusText}</td>
            <td>${r.imported_count ?? 0}</td>
            <td>${r.error_message || "-"}</td>
          </tr>
        `;
      })
      .join("");
  }

  async function loadAccountSetImports() {
    const id = currentAccountSetId();
    if (!id) {
      renderImports([]);
      return;
    }
    const res = await fetch(`/admin/account-sets/${id}/imports`);
    const data = await res.json();
    renderImports(Array.isArray(data) ? data : []);
  }

  async function loadAccountSets() {
    const res = await fetch("/admin/account-sets");
    const data = await res.json();
    accountSets = Array.isArray(data) ? data : [];
    renderAccountSets();
    await loadAccountSetImports();
  }

  createAccountSetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(createAccountSetForm);
    const month = fd.get("month");
    const res = await fetch("/admin/account-sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month }),
    });
    const data = await res.json();
    if (!res.ok) {
      window.AppFeedback.setResult(accountSetResult, data.error || "创建账套失败", "danger");
      window.AppToast.error(data.error || "创建账套失败", "创建账套失败");
      return;
    }
    window.AppFeedback.setResult(accountSetResult, `创建成功：${data.account_set.name}`, "success");
    window.AppToast.success(`创建成功：${data.account_set.name}`, "创建账套成功");
    createAccountSetForm.reset();
    await loadAccountSets();
  });

  saveAccountSetParamsBtn.addEventListener("click", async () => {
    const id = currentAccountSetId();
    if (!id) {
      window.AppFeedback.setResult(accountSetResult, "请先选择账套", "danger");
      return;
    }
    const res = await fetch(`/admin/account-sets/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        factory_rest_days: factoryRestDaysInput.value || "0",
        monthly_benefit_days: monthlyBenefitDaysInput.value || "0",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      window.AppFeedback.setResult(accountSetResult, data.error || "保存账套参数失败", "danger");
      window.AppToast.error(data.error || "保存账套参数失败", "保存失败");
      return;
    }
    window.AppFeedback.setResult(accountSetResult, "账套参数已保存", "success");
    window.AppToast.success("账套参数已保存", "保存成功");
    await loadAccountSets();
  });

  activateAccountSetBtn.addEventListener("click", async () => {
    const id = currentAccountSetId();
    if (!id) {
      window.AppFeedback.setResult(accountSetResult, "请先选择账套", "danger");
      return;
    }
    const res = await fetch(`/admin/account-sets/${id}/activate`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      window.AppFeedback.setResult(accountSetResult, data.error || "设置当前账套失败", "danger");
      window.AppToast.error(data.error || "设置当前账套失败", "切换失败");
      return;
    }
    window.AppFeedback.setResult(accountSetResult, `已切换当前账套：${data.account_set.name}`, "success");
    window.AppToast.success(`已切换当前账套：${data.account_set.name}`, "切换成功");
    await loadAccountSets();
  });

  lockAccountSetBtn.addEventListener("click", async () => {
    const id = currentAccountSetId();
    if (!id) {
      window.AppFeedback.setResult(accountSetResult, "请先选择账套", "danger");
      return;
    }
    if (!(await window.AppDialog.confirm("确认锁定该账套吗？锁定后将不能上传、计算、修正或删除。", "锁定账套"))) return;
    const res = await fetch(`/admin/account-sets/${id}/lock`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      window.AppFeedback.setResult(accountSetResult, data.error || "锁定账套失败", "danger");
      window.AppToast.error(data.error || "锁定账套失败", "锁定失败");
      return;
    }
    window.AppFeedback.setResult(accountSetResult, `账套已锁定：${data.account_set.name}`, "success");
    window.AppToast.success(`账套已锁定：${data.account_set.name}`, "锁定成功");
    await loadAccountSets();
  });

  unlockAccountSetBtn.addEventListener("click", async () => {
    const id = currentAccountSetId();
    if (!id) {
      window.AppFeedback.setResult(accountSetResult, "请先选择账套", "danger");
      return;
    }
    if (!(await window.AppDialog.confirm("确认解锁该账套吗？解锁后将恢复修改能力。", "解锁账套"))) return;
    const res = await fetch(`/admin/account-sets/${id}/unlock`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      window.AppFeedback.setResult(accountSetResult, data.error || "解锁账套失败", "danger");
      window.AppToast.error(data.error || "解锁账套失败", "解锁失败");
      return;
    }
    window.AppFeedback.setResult(accountSetResult, `账套已解锁：${data.account_set.name}`, "success");
    window.AppToast.success(`账套已解锁：${data.account_set.name}`, "解锁成功");
    await loadAccountSets();
  });

  deleteAccountSetBtn.addEventListener("click", async () => {
    const id = currentAccountSetId();
    if (!id) {
      window.AppFeedback.setResult(accountSetResult, "请先选择账套", "danger");
      return;
    }
    if (!(await window.AppDialog.confirm("确认删除该账套吗？将同时删除账套下的归档文件记录。", "删除账套"))) return;

    const res = await fetch(`/admin/account-sets/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      window.AppFeedback.setResult(accountSetResult, data.error || "删除账套失败", "danger");
      window.AppToast.error(data.error || "删除账套失败", "删除失败");
      return;
    }
    window.AppFeedback.setResult(accountSetResult, "账套已删除", "success");
    window.AppToast.success("账套已删除", "删除成功");
    await loadAccountSets();
  });

  refreshAccountSetsBtn.addEventListener("click", loadAccountSets);
  accountSetSelect.addEventListener("change", async () => {
    renderAccountSetParams();
    await loadAccountSetImports();
  });

  importRawForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const accountSetId = currentAccountSetId();
    if (!accountSetId) {
      window.AppToast.error("请先创建并选择账套", "上传失败");
      return;
    }

    const selectedFiles = Array.from(importRawForm.querySelectorAll('input[type="file"][name="files"]'))
      .flatMap((input) => Array.from(input.files || []))
      .filter((file) => file.name);
    if (!selectedFiles.length) {
      window.AppToast.error("请至少选择一个要上传的源文件", "上传失败");
      return;
    }

    const formData = new FormData(importRawForm);
    formData.append("account_set_id", String(accountSetId));
    importRawBtn.disabled = true;
    importRawBtn.textContent = "上传中...";
    try {
      const res = await fetch("/admin/import/raw-files", { method: "POST", body: formData });
      const data = await res.json();
      const results = Array.isArray(data.results) ? data.results : [];
      const failedRows = results.filter((x) => x.status !== "ok");

      if (res.ok && failedRows.length === 0 && (data.failed || 0) === 0) {
        window.AppToast.success("上传成功，已归档到账套。", "上传成功");
      } else {
        const details = failedRows.map((x, i) => `${i + 1}. ${x.file || "未知文件"}: ${x.error || "上传失败"}`);
        window.AppToast.error(`上传失败，错误明细：\n${details.join("\n")}`, "上传失败");
      }
      await loadAccountSets();
      await loadAccountSetImports();
    } catch (err) {
      window.AppToast.error(err?.message || "网络或服务异常", "上传失败");
    } finally {
      importRawBtn.disabled = false;
      importRawBtn.textContent = "上传原始文件";
    }
  });

  async function runCalculation(mode, button, label) {
    const accountSetId = currentAccountSetId();
    if (!accountSetId) {
      window.AppToast.error("请先选择账套", label);
      return;
    }
    calculateEmployeeBtn.disabled = true;
    calculateManagerBtn.disabled = true;
    button.textContent = "计算中...";
    try {
      const res = await fetch(`/admin/account-sets/${accountSetId}/calculate?mode=${encodeURIComponent(mode)}`, { method: "POST" });
      const data = await res.json();
      const results = Array.isArray(data.results) ? data.results : [];
      const failedRows = results.filter((x) => x.status !== "ok");
      const summaryLines = results.map((x, i) => {
        const r = x.result || {};
        const imported = r.imported ?? 0;
        const total = r.total_rows ?? "-";
        const skipped = r.skipped ?? "-";
        const unknown = r.skipped_unknown_employee ?? "-";
        return `${i + 1}. ${x.file || "未知文件"}: 导入${imported} / 原始${total} / 跳过${skipped} / 未匹配员工${unknown}`;
      });
      const sync = data.manager_stats_sync || null;
      if (sync) {
        summaryLines.push(`管理人员加班/年休回写: 加班${sync.overtime_synced || 0}人 / 年休${sync.annual_leave_synced || 0}人 / 失败${sync.error_count || 0}条`);
        if (Array.isArray(sync.errors) && sync.errors.length) {
          summaryLines.push(`回写失败明细:\n${sync.errors.join("\n")}`);
        }
      }

      if (res.ok && failedRows.length === 0) {
        window.AppToast.success(`${label}成功`, label);
      } else {
        const details = failedRows.map((x, i) => `${i + 1}. ${x.file || "未知文件"}: ${x.error || "计算失败"}`);
        window.AppToast.error(`${label}失败，错误明细：\n${details.join("\n")}\n\n已处理统计：\n${summaryLines.join("\n")}`, label);
      }
      await loadAccountSets();
      await loadAccountSetImports();
    } catch (err) {
      window.AppToast.error(err?.message || "网络或服务异常", `${label}失败`);
    } finally {
      calculateEmployeeBtn.disabled = false;
      calculateManagerBtn.disabled = false;
      button.textContent = label;
    }
  }

  calculateEmployeeBtn.addEventListener("click", () => runCalculation("employee", calculateEmployeeBtn, "员工计算"));
  calculateManagerBtn.addEventListener("click", () => runCalculation("manager", calculateManagerBtn, "管理人员计算"));

  loadAccountSets();
});
