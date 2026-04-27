(function () {
  const STORAGE_KEY = "attendance.tableDensity";

  function setDensity(mode) {
    document.body.classList.toggle("density-compact", mode === "compact");
    const btn = document.getElementById("densityToggleBtn");
    if (btn) {
      btn.textContent = mode === "compact" ? "标准表格" : "紧凑表格";
      btn.setAttribute("aria-pressed", mode === "compact" ? "true" : "false");
    }
  }

  function normalizeEmptyStates() {
    document.querySelectorAll("tbody td.text-muted").forEach((cell) => {
      if (cell.classList.contains("empty-cell")) return;
      const text = (cell.textContent || "").trim();
      if (!text) return;
      cell.classList.add("empty-cell");
      cell.innerHTML = `<span class=\"empty-badge\">${text}</span>`;
    });
  }

  function applyStickyOffset() {
    const nav = document.querySelector(".top-nav");
    const h = nav ? nav.getBoundingClientRect().height : 60;
    document.documentElement.style.setProperty("--table-sticky-top", `${Math.ceil(h) + 8}px`);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const saved = localStorage.getItem(STORAGE_KEY) || "normal";
    setDensity(saved);
    applyStickyOffset();
    normalizeEmptyStates();

    const btn = document.getElementById("densityToggleBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        const current = document.body.classList.contains("density-compact") ? "compact" : "normal";
        const next = current === "compact" ? "normal" : "compact";
        localStorage.setItem(STORAGE_KEY, next);
        setDensity(next);
      });
    }

    const observer = new MutationObserver(() => {
      normalizeEmptyStates();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("resize", applyStickyOffset);
  });
})();
