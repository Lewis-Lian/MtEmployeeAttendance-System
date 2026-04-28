document.addEventListener("DOMContentLoaded", () => {
  const importRawForm = document.getElementById("importRawForm");
  const importRawBtn = document.getElementById("importRawBtn");
  const calculateEmployeeBtn = document.getElementById("calculateEmployeeBtn");
  const calculateManagerBtn = document.getElementById("calculateManagerBtn");
  const uploadResult = document.getElementById("uploadResult");
  const createAccountSetForm = document.getElementById("createAccountSetForm");
  const accountSetSelect = document.getElementById("accountSetSelect");
  const factoryRestDaysInput = document.getElementById("factoryRestDaysInput");
  const monthlyBenefitDaysInput = document.getElementById("monthlyBenefitDaysInput");
  const saveAccountSetParamsBtn = document.getElementById("saveAccountSetParamsBtn");
  const activateAccountSetBtn = document.getElementById("activateAccountSetBtn");
  const deleteAccountSetBtn = document.getElementById("deleteAccountSetBtn");
  const refreshAccountSetsBtn = document.getElementById("refreshAccountSetsBtn");
  const accountSetResult = document.getElementById("accountSetResult");
  const accountSetImportsBody = document.getElementById("accountSetImportsBody");

  uploadResult.style.whiteSpace = "pre-line";
  let accountSets = [];

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
      accountSetResult.className = "small mt-2 text-danger";
      accountSetResult.textContent = data.error || "创建账套失败";
      return;
    }
    accountSetResult.className = "small mt-2 text-success";
    accountSetResult.textContent = `创建成功：${data.account_set.name}`;
    createAccountSetForm.reset();
    await loadAccountSets();
  });

  saveAccountSetParamsBtn.addEventListener("click", async () => {
    const id = currentAccountSetId();
    if (!id) {
      accountSetResult.className = "small mt-2 text-danger";
      accountSetResult.textContent = "请先选择账套";
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
      accountSetResult.className = "small mt-2 text-danger";
      accountSetResult.textContent = data.error || "保存账套参数失败";
      return;
    }
    accountSetResult.className = "small mt-2 text-success";
    accountSetResult.textContent = "账套参数已保存";
    await loadAccountSets();
  });

  activateAccountSetBtn.addEventListener("click", async () => {
    const id = currentAccountSetId();
    if (!id) {
      accountSetResult.className = "small mt-2 text-danger";
      accountSetResult.textContent = "请先选择账套";
      return;
    }
    const res = await fetch(`/admin/account-sets/${id}/activate`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      accountSetResult.className = "small mt-2 text-danger";
      accountSetResult.textContent = data.error || "设置当前账套失败";
      return;
    }
    accountSetResult.className = "small mt-2 text-success";
    accountSetResult.textContent = `已切换当前账套：${data.account_set.name}`;
    await loadAccountSets();
  });

  deleteAccountSetBtn.addEventListener("click", async () => {
    const id = currentAccountSetId();
    if (!id) {
      accountSetResult.className = "small mt-2 text-danger";
      accountSetResult.textContent = "请先选择账套";
      return;
    }
    if (!window.confirm("确认删除该账套吗？将同时删除账套下的归档文件记录。")) return;

    const res = await fetch(`/admin/account-sets/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      accountSetResult.className = "small mt-2 text-danger";
      accountSetResult.textContent = data.error || "删除账套失败";
      return;
    }
    accountSetResult.className = "small mt-2 text-success";
    accountSetResult.textContent = "账套已删除";
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
      uploadResult.className = "small mt-2 text-danger";
      uploadResult.textContent = "请先创建并选择账套";
      return;
    }

    const formData = new FormData(importRawForm);
    formData.append("account_set_id", String(accountSetId));
    importRawBtn.disabled = true;
    importRawBtn.textContent = "上传中...";
    uploadResult.textContent = "";
    try {
      const res = await fetch("/admin/import/raw-files", { method: "POST", body: formData });
      const data = await res.json();
      const results = Array.isArray(data.results) ? data.results : [];
      const failedRows = results.filter((x) => x.status !== "ok");

      if (res.ok && failedRows.length === 0 && (data.failed || 0) === 0) {
        uploadResult.className = "small mt-2 text-success";
        uploadResult.textContent = "上传成功，已归档到账套，点击“开始计算”后才会生成考勤数据。";
      } else {
        const details = failedRows.map((x, i) => `${i + 1}. ${x.file || "未知文件"}: ${x.error || "上传失败"}`);
        uploadResult.className = "small mt-2 text-danger";
        uploadResult.textContent = `上传失败，错误明细：\n${details.join("\n")}`;
      }
      await loadAccountSets();
      await loadAccountSetImports();
    } catch (err) {
      uploadResult.className = "small mt-2 text-danger";
      uploadResult.textContent = `上传失败：${err?.message || "网络或服务异常"}`;
    } finally {
      importRawBtn.disabled = false;
      importRawBtn.textContent = "上传原始文件";
    }
  });

  async function runCalculation(mode, button, label) {
    const accountSetId = currentAccountSetId();
    if (!accountSetId) {
      uploadResult.className = "small mt-2 text-danger";
      uploadResult.textContent = "请先选择账套";
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
        uploadResult.className = "small mt-2 text-success";
        uploadResult.textContent = `${label}成功\n${summaryLines.join("\n")}`;
      } else {
        const details = failedRows.map((x, i) => `${i + 1}. ${x.file || "未知文件"}: ${x.error || "计算失败"}`);
        uploadResult.className = "small mt-2 text-danger";
        uploadResult.textContent = `${label}失败，错误明细：\n${details.join("\n")}\n\n已处理统计：\n${summaryLines.join("\n")}`;
      }
      await loadAccountSets();
      await loadAccountSetImports();
    } catch (err) {
      uploadResult.className = "small mt-2 text-danger";
      uploadResult.textContent = `${label}失败：${err?.message || "网络或服务异常"}`;
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
