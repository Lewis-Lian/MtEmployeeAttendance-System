document.addEventListener("DOMContentLoaded", () => {
  const targets = [];
  const seen = new Set();

  function collect(selector) {
    document.querySelectorAll(selector).forEach((element) => {
      if (!seen.has(element)) {
        seen.add(element);
        targets.push(element);
      }
    });
  }

  collect(".query-metric-grid");
  collect(".module-summary-grid");
  document.querySelectorAll(".row.g-3.mb-3").forEach((row) => {
    if (row.querySelector(".summary-card.dashboard-metric-card") && !seen.has(row)) {
      seen.add(row);
      targets.push(row);
    }
  });

  const validTargets = targets.filter((target) => target.children.length && target.dataset.metricToggleBound !== "1");
  if (!validTargets.length) return;

  validTargets.forEach((target) => {
    target.dataset.metricToggleBound = "1";
    target.classList.add("metric-toggle-target", "is-collapsed");
    target.hidden = true;
  });

  const actions = document.querySelector(".top-nav-actions");
  if (!actions) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-outline-secondary btn-sm metric-toggle-btn top-nav-metric-toggle";
  button.setAttribute("aria-expanded", "false");
  button.textContent = "展开卡片";

  button.addEventListener("click", () => {
    const expanded = button.getAttribute("aria-expanded") === "true";
    if (expanded) {
      button.setAttribute("aria-expanded", "false");
      button.textContent = "展开卡片";
      validTargets.forEach((target) => {
        target.hidden = true;
        target.classList.add("is-collapsed");
      });
    } else {
      button.setAttribute("aria-expanded", "true");
      button.textContent = "收起卡片";
      validTargets.forEach((target) => {
        target.hidden = false;
        target.classList.remove("is-collapsed");
      });
    }
  });

  const userBlock = actions.querySelector(".top-nav-user");
  if (userBlock) {
    actions.insertBefore(button, userBlock);
  } else {
    actions.appendChild(button);
  }
});
