(function () {
  const SIDEBAR_KEY = "attendance.sidebarCollapsed";
  const SIDEBAR_GROUPS_KEY = "attendance.sidebarGroups";

  function setSidebarCollapsed(collapsed) {
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    const btn = document.getElementById("sidebarToggleBtn");
    if (btn) {
      btn.setAttribute("aria-pressed", collapsed ? "true" : "false");
      btn.setAttribute("aria-label", collapsed ? "展开菜单" : "折叠菜单");
      const icon = btn.querySelector(".app-sidebar-toggle-icon");
      if (icon) icon.textContent = collapsed ? "›" : "‹";
    }
  }

  function readSidebarGroups() {
    try {
      return JSON.parse(localStorage.getItem(SIDEBAR_GROUPS_KEY) || "{}");
    } catch (_) {
      return {};
    }
  }

  function writeSidebarGroups(state) {
    localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(state || {}));
  }

  function setSidebarGroupCollapsed(groupEl, collapsed) {
    if (!groupEl) return;
    groupEl.classList.toggle("is-collapsed", collapsed);
    groupEl.classList.toggle("is-current", Boolean(groupEl.querySelector(".app-side-link.is-active")));
    const toggle = groupEl.querySelector("[data-sidebar-toggle]");
    if (toggle) toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  function setMobileSidebarOpen(open) {
    document.body.classList.toggle("sidebar-mobile-open", open);
    const btn = document.getElementById("mobileSidebarBtn");
    if (btn) {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单");
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
    const sidebarSaved = localStorage.getItem(SIDEBAR_KEY) === "1";
    const groupState = readSidebarGroups();
    setSidebarCollapsed(sidebarSaved);
    applyStickyOffset();
    normalizeEmptyStates();

    document.querySelectorAll("[data-sidebar-group]").forEach((groupEl) => {
      const groupName = groupEl.getAttribute("data-sidebar-group") || "";
      const hasActive = Boolean(groupEl.querySelector(".app-side-link.is-active"));
      const collapsed = hasActive ? false : Boolean(groupState[groupName]);
      setSidebarGroupCollapsed(groupEl, collapsed);
    });

    const sidebarBtn = document.getElementById("sidebarToggleBtn");
    if (sidebarBtn) {
      sidebarBtn.addEventListener("click", () => {
        const next = !document.body.classList.contains("sidebar-collapsed");
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
        setSidebarCollapsed(next);
      });
    }

    const mobileSidebarBtn = document.getElementById("mobileSidebarBtn");
    const sidebarBackdrop = document.getElementById("sidebarBackdrop");
    if (mobileSidebarBtn) {
      mobileSidebarBtn.addEventListener("click", () => {
        setMobileSidebarOpen(!document.body.classList.contains("sidebar-mobile-open"));
      });
    }
    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener("click", () => setMobileSidebarOpen(false));
    }
    document.querySelectorAll(".app-side-link").forEach((link) => {
      link.addEventListener("click", () => setMobileSidebarOpen(false));
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth > 992) setMobileSidebarOpen(false);
    });

    document.querySelectorAll("[data-sidebar-toggle]").forEach((toggleBtn) => {
      toggleBtn.addEventListener("click", () => {
        const groupName = toggleBtn.getAttribute("data-sidebar-toggle") || "";
        const groupEl = document.querySelector(`[data-sidebar-group="${groupName}"]`);
        if (!groupEl) return;
        const nextCollapsed = !groupEl.classList.contains("is-collapsed");
        setSidebarGroupCollapsed(groupEl, nextCollapsed);
        const state = readSidebarGroups();
        state[groupName] = nextCollapsed;
        writeSidebarGroups(state);
      });
    });

    const observer = new MutationObserver(() => {
      normalizeEmptyStates();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("resize", applyStickyOffset);
  });
})();
