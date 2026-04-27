document.addEventListener("DOMContentLoaded", () => {
  const importRawForm = document.getElementById("importRawForm");
  const importRawBtn = document.getElementById("importRawBtn");
  const calculateBtn = document.getElementById("calculateBtn");
  const uploadResult = document.getElementById("uploadResult");
  const createAccountSetForm = document.getElementById("createAccountSetForm");
  const accountSetSelect = document.getElementById("accountSetSelect");
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

  function renderAccountSets() {
    if (!accountSets.length) {
      accountSetSelect.innerHTML = `<option value="">暂无账套，请先创建</option>`;
      return;
    }
    accountSetSelect.innerHTML = accountSets
      .map(
        (x) =>
          `<option value="${x.id}" ${x.is_active ? "selected" : ""}>${x.name}${x.is_active ? "（当前）" : ""} [待计算${x.pending_count || 0}]</option>`
      )
      .join("");
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
    const month = new FormData(createAccountSetForm).get("month");
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
  accountSetSelect.addEventListener("change", loadAccountSetImports);

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

      if (res.ok && failedRows.length === 0) {
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

  calculateBtn.addEventListener("click", async () => {
    const accountSetId = currentAccountSetId();
    if (!accountSetId) {
      uploadResult.className = "small mt-2 text-danger";
      uploadResult.textContent = "请先选择账套";
      return;
    }
    calculateBtn.disabled = true;
    calculateBtn.textContent = "计算中...";
    try {
      const res = await fetch(`/admin/account-sets/${accountSetId}/calculate`, { method: "POST" });
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

      if (res.ok && failedRows.length === 0) {
        uploadResult.className = "small mt-2 text-success";
        uploadResult.textContent = `计算成功\n${summaryLines.join("\n")}`;
      } else {
        const details = failedRows.map((x, i) => `${i + 1}. ${x.file || "未知文件"}: ${x.error || "计算失败"}`);
        uploadResult.className = "small mt-2 text-danger";
        uploadResult.textContent = `计算失败，错误明细：\n${details.join("\n")}\n\n已处理统计：\n${summaryLines.join("\n")}`;
      }
      await loadAccountSets();
      await loadAccountSetImports();
    } catch (err) {
      uploadResult.className = "small mt-2 text-danger";
      uploadResult.textContent = `计算失败：${err?.message || "网络或服务异常"}`;
    } finally {
      calculateBtn.disabled = false;
      calculateBtn.textContent = "开始计算";
    }
  });

  loadAccountSets();
});
