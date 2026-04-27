(function () {
  const PAGE_SIZES = [50, 100, 500, 1000, 2000];
  const DEFAULT_SIZE = 100;

  function isPlaceholderRow(row) {
    const cells = row.querySelectorAll("td");
    if (cells.length !== 1) return false;
    const cell = cells[0];
    return cell.classList.contains("text-muted") || cell.classList.contains("empty-cell");
  }

  function isSummaryRow(row) {
    if (row.classList.contains("table-primary")) return true;
    const firstCell = row.querySelector("td");
    if (!firstCell) return false;
    const text = (firstCell.textContent || "").trim();
    return text.includes("总计");
  }

  function makePager(table, tbody) {
    const existing = table.parentElement.parentElement.querySelector(":scope > .table-pager");
    if (existing) return existing;

    const pager = document.createElement("div");
    pager.className = "table-pager";
    pager.innerHTML = `
      <div class="table-pager-right">
        <span class="table-pager-total">共 0 条记录</span>
        <label class="small text-muted mb-0">每页</label>
        <select class="form-select form-select-sm" style="width: 88px;">
          ${PAGE_SIZES.map((n) => `<option value="${n}" ${n === DEFAULT_SIZE ? "selected" : ""}>${n}</option>`).join("")}
        </select>
        <button class="btn btn-sm btn-outline-secondary" type="button" data-action="prev">上一页</button>
        <span class="table-pager-page">第 1 / 1 页</span>
        <div class="table-pager-jump">
          <input class="form-control form-control-sm" type="number" min="1" step="1" placeholder="页码">
          <button class="btn btn-sm btn-outline-secondary" type="button" data-action="jump">跳转</button>
        </div>
        <button class="btn btn-sm btn-outline-secondary" type="button" data-action="next">下一页</button>
      </div>
    `;

    const container = table.parentElement.parentElement;
    container.appendChild(pager);
    return pager;
  }

  function bindPager(table) {
    if (table.dataset.pagerBound === "1") return;
    const tbody = table.querySelector("tbody");
    if (!tbody) return;

    const pager = makePager(table, tbody);
    const totalText = pager.querySelector(".table-pager-total");
    const sizeSelect = pager.querySelector("select");
    const pageText = pager.querySelector(".table-pager-page");
    const jumpInput = pager.querySelector(".table-pager-jump input");
    const jumpBtn = pager.querySelector('[data-action="jump"]');
    const prevBtn = pager.querySelector('[data-action="prev"]');
    const nextBtn = pager.querySelector('[data-action="next"]');

    const state = {
      page: 1,
      size: DEFAULT_SIZE,
      dataRows: [],
      summaryRows: [],
      placeholderRows: [],
    };

    function collectRows() {
      const rows = Array.from(tbody.querySelectorAll(":scope > tr"));
      state.placeholderRows = rows.filter(isPlaceholderRow);
      const candidateRows = rows.filter((r) => !isPlaceholderRow(r));
      state.summaryRows = candidateRows.filter(isSummaryRow);
      state.dataRows = candidateRows.filter((r) => !isSummaryRow(r));
    }

    function render() {
      collectRows();

      if (!state.dataRows.length) {
        state.placeholderRows.forEach((r) => {
          r.style.display = "";
        });
        state.summaryRows.forEach((r) => {
          r.style.display = "";
        });
        totalText.textContent = "共 0 条记录";
        pageText.textContent = "第 1 / 1 页";
        jumpInput.value = "";
        jumpInput.max = "1";
        jumpInput.disabled = true;
        jumpBtn.disabled = true;
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        pager.style.display = "none";
        return;
      }

      const total = state.dataRows.length;
      const pages = Math.max(1, Math.ceil(total / state.size));
      if (state.page > pages) state.page = pages;
      if (state.page < 1) state.page = 1;

      const start = (state.page - 1) * state.size;
      const end = start + state.size;

      state.placeholderRows.forEach((r) => {
        r.style.display = "none";
      });
      state.dataRows.forEach((r, idx) => {
        r.style.display = idx >= start && idx < end ? "" : "none";
      });
      state.summaryRows.forEach((r) => {
        r.style.display = "";
      });

      totalText.textContent = `共 ${total} 条记录`;
      pageText.textContent = `第 ${state.page} / ${pages} 页`;
      jumpInput.max = String(pages);
      jumpInput.disabled = false;
      jumpBtn.disabled = false;
      prevBtn.disabled = state.page <= 1;
      nextBtn.disabled = state.page >= pages;
      pager.style.display = "flex";
    }

    function jumpToPage() {
      const target = Number(jumpInput.value || 0);
      if (!target) return;
      state.page = target;
      render();
      jumpInput.value = String(state.page);
    }

    sizeSelect.addEventListener("change", () => {
      state.size = Number(sizeSelect.value || DEFAULT_SIZE);
      state.page = 1;
      render();
    });

    prevBtn.addEventListener("click", () => {
      state.page -= 1;
      render();
    });

    nextBtn.addEventListener("click", () => {
      state.page += 1;
      render();
    });

    jumpBtn.addEventListener("click", jumpToPage);
    jumpInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      jumpToPage();
    });

    const observer = new MutationObserver(() => {
      render();
    });
    observer.observe(tbody, { childList: true, subtree: false });

    render();
    table.dataset.pagerBound = "1";
  }

  function bindDragScroll(container) {
    if (container.dataset.dragBound === "1") return;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let left = 0;
    let top = 0;

    container.addEventListener("mousedown", (e) => {
      const tag = (e.target && e.target.tagName ? e.target.tagName.toLowerCase() : "");
      if (["input", "select", "button", "a", "label", "textarea"].includes(tag)) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      left = container.scrollLeft;
      top = container.scrollTop;
      container.classList.add("is-dragging");
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      container.scrollLeft = left - dx;
      container.scrollTop = top - dy;
    });

    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      container.classList.remove("is-dragging");
    });

    container.dataset.dragBound = "1";
  }

  function init() {
    document.querySelectorAll(".table-responsive table").forEach(bindPager);
    document.querySelectorAll(".table-responsive").forEach(bindDragScroll);
  }

  document.addEventListener("DOMContentLoaded", () => {
    init();
    const observer = new MutationObserver(() => init());
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
