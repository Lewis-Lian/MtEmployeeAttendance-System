window.AppDialog = (() => {
  let modal = null;
  let modalEl = null;
  let titleEl = null;
  let messageEl = null;
  let inputWrapEl = null;
  let inputLabelEl = null;
  let inputEl = null;
  let cancelBtn = null;
  let confirmBtn = null;
  let activeResolver = null;
  let activeType = "alert";

  function ensureInit() {
    if (modal) return true;
    modalEl = document.getElementById("appDialogModal");
    titleEl = document.getElementById("appDialogTitle");
    messageEl = document.getElementById("appDialogMessage");
    inputWrapEl = document.getElementById("appDialogInputWrap");
    inputLabelEl = document.getElementById("appDialogInputLabel");
    inputEl = document.getElementById("appDialogInput");
    cancelBtn = document.getElementById("appDialogCancelBtn");
    confirmBtn = document.getElementById("appDialogConfirmBtn");
    if (!modalEl || !titleEl || !messageEl || !inputWrapEl || !inputLabelEl || !inputEl || !cancelBtn || !confirmBtn) {
      return false;
    }
    modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    confirmBtn.addEventListener("click", handleConfirm);
    modalEl.addEventListener("hidden.bs.modal", handleHidden);
    return true;
  }

  function handleConfirm() {
    if (!activeResolver) return;
    const resolver = activeResolver;
    activeResolver = null;
    if (activeType === "confirm") resolver(true);
    else if (activeType === "prompt") resolver(inputEl.value);
    else resolver();
    modal.hide();
  }

  function handleHidden() {
    if (!activeResolver) return;
    const resolver = activeResolver;
    activeResolver = null;
    if (activeType === "confirm") resolver(false);
    else if (activeType === "prompt") resolver(null);
    else resolver();
  }

  function open(options) {
    if (!ensureInit()) {
      return Promise.resolve(options.type === "confirm" ? false : (options.type === "prompt" ? null : undefined));
    }
    activeType = options.type || "alert";
    titleEl.textContent = options.title || "提示";
    messageEl.textContent = options.message || "";
    cancelBtn.classList.toggle("d-none", activeType === "alert");
    inputWrapEl.classList.toggle("d-none", activeType !== "prompt");
    inputLabelEl.textContent = options.inputLabel || "输入内容";
    inputEl.value = options.defaultValue || "";
    confirmBtn.textContent = options.confirmText || "确定";
    cancelBtn.textContent = options.cancelText || "取消";

    return new Promise((resolve) => {
      activeResolver = resolve;
      modal.show();
      if (activeType === "prompt") {
        window.setTimeout(() => inputEl.focus(), 50);
      } else {
        window.setTimeout(() => confirmBtn.focus(), 50);
      }
    });
  }

  return {
    alert(message, title = "提示") {
      return open({ type: "alert", title, message });
    },
    confirm(message, title = "确认") {
      return open({ type: "confirm", title, message });
    },
    prompt(message, defaultValue = "", title = "请输入", inputLabel = "输入内容") {
      return open({ type: "prompt", title, message, defaultValue, inputLabel });
    },
  };
})();

window.AppToast = (() => {
  function show(message, type = "success", title = "") {
    const container = document.getElementById("appToastContainer");
    if (!container) return;
    const toastEl = document.createElement("div");
    const borderClass = type === "danger" ? "border-danger" : (type === "warning" ? "border-warning" : "border-success");
    const titleText = title || (type === "danger" ? "失败" : (type === "warning" ? "提示" : "成功"));
    toastEl.className = `toast align-items-center border ${borderClass}`;
    toastEl.setAttribute("role", "alert");
    toastEl.setAttribute("aria-live", "assertive");
    toastEl.setAttribute("aria-atomic", "true");
    toastEl.innerHTML = `
      <div class="toast-header">
        <strong class="me-auto">${titleText}</strong>
        <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body" style="white-space: pre-line;">${String(message || "")}</div>
    `;
    container.appendChild(toastEl);
    const toast = bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 2800 });
    toastEl.addEventListener("hidden.bs.toast", () => {
      toastEl.remove();
    });
    toast.show();
  }

  return {
    success(message, title = "成功") {
      show(message, "success", title);
    },
    error(message, title = "失败") {
      show(message, "danger", title);
    },
    warning(message, title = "提示") {
      show(message, "warning", title);
    },
  };
})();

window.AppFeedback = {
  setResult(el, message, type = "muted") {
    if (!el) return;
    const levelClass = type === "success"
      ? "result-panel result-panel-success"
      : (type === "danger" ? "result-panel result-panel-danger" : "result-panel result-panel-muted");
    el.className = `small mt-2 ${levelClass}`;
    const title = type === "success" ? "成功" : (type === "danger" ? "失败" : "提示");
    const emptyText = type === "muted" ? "等待操作" : "-";
    el.innerHTML = message
      ? `<div class="result-panel-title">${title}</div><div class="result-panel-body">${String(message || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</div>`
      : `<div class="result-panel-title">${title}</div><div class="result-panel-body">${emptyText}</div>`;
  },
};
