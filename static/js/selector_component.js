(function () {
  function normalizeText(v) {
    return (v || "").toString().trim().toLowerCase().replace(/\s+/g, "");
  }

  function createHierarchy(rows, getId, getParentId, getName) {
    const map = new Map();
    const children = new Map();
    children.set("", []);

    rows.forEach((row) => {
      const id = String(getId(row) || "").trim();
      if (!id) return;
      const parentId = String(getParentId(row) || "").trim();
      map.set(id, { id, parentId, name: getName(row) || "", row });
      children.set(id, []);
    });

    map.forEach((node) => {
      const parentKey = node.parentId && map.has(node.parentId) ? node.parentId : "";
      children.get(parentKey).push(node.id);
    });

    children.forEach((ids, key) => {
      ids.sort((a, b) => (map.get(a)?.name || "").localeCompare(map.get(b)?.name || "", "zh-CN"));
      children.set(key, ids);
    });

    return { map, children };
  }

  function createSingleSelectTreeLookup(options) {
    const opts = options || {};
    const contexts = Array.isArray(opts.contexts) ? opts.contexts : [];
    const modalEl = opts.modalEl;
    const treeEl = opts.treeEl;
    const listEl = opts.listEl || null;
    const searchEl = opts.searchEl;
    const selectedEl = opts.selectedEl;
    const confirmBtn = opts.confirmBtn;
    const clearBtn = opts.clearBtn;
    const getEntities = typeof opts.getEntities === "function" ? opts.getEntities : () => [];
    const getExcludedIds = typeof opts.getExcludedIds === "function" ? opts.getExcludedIds : () => new Set();
    const getId = typeof opts.getId === "function" ? opts.getId : (x) => x?.id;
    const getParentId = typeof opts.getParentId === "function" ? opts.getParentId : (x) => x?.parent_id;
    const getName = typeof opts.getName === "function" ? opts.getName : (x) => x?.dept_name || "";
    const getCode = typeof opts.getCode === "function" ? opts.getCode : (x) => x?.dept_no || "";
    const emptyId = opts.emptyId === undefined ? "" : String(opts.emptyId);
    const emptyLabel = opts.emptyLabel || "无";
    const emptySelectedHtml = opts.emptySelectedHtml || `<div class="employee-selected-empty">未选择</div>`;
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    let hierarchy = createHierarchy([], getId, getParentId, getName);
    let expanded = new Set();
    let activeCtx = null;
    let selectedId = emptyId;

    function entityById(id) {
      return hierarchy.map.get(String(id || ""));
    }

    function setValue(ctx, id) {
      const value = id ? String(id) : "";
      ctx.hiddenEl.value = value;
      if (!value) {
        ctx.inputEl.value = "";
        return;
      }
      const entity = entityById(value);
      ctx.inputEl.value = entity ? entity.name : "";
    }

    function renderQuickList(ctx) {
      const keyword = normalizeText(ctx.inputEl.value);
      const excluded = getExcludedIds(ctx) || new Set();
      const rows = getEntities().filter((x) => {
        const id = Number(getId(x) || 0);
        if (excluded.has(id)) return false;
        if (!keyword) return true;
        return normalizeText(`${getCode(x)} ${getName(x)}`).includes(keyword);
      });
      const html = [
        `<button class="employee-option dept-quick-option" type="button" data-id="${emptyId}">${emptyLabel}</button>`,
        ...rows.map((x) => `<button class="employee-option dept-quick-option" type="button" data-id="${getId(x)}">${getName(x)}</button>`),
      ].join("");
      ctx.quickEl.innerHTML = html;
    }

    function showQuickList(ctx) {
      ctx.quickEl.classList.add("show");
    }

    function hideQuickList(ctx) {
      ctx.quickEl.classList.remove("show");
    }

    function renderSelected() {
      if (!selectedId || selectedId === emptyId) {
        selectedEl.innerHTML = emptySelectedHtml;
        return;
      }
      const entity = entityById(selectedId);
      if (!entity) {
        selectedEl.innerHTML = emptySelectedHtml;
        return;
      }
      selectedEl.innerHTML = `
        <div class="employee-selected-row">
          <div>
            <div class="employee-selected-main">${entity.name}</div>
            <div class="employee-selected-sub">${getCode(entity.row) || ""}</div>
          </div>
        </div>
      `;
    }

    function renderTree() {
      const keyword = normalizeText(searchEl ? searchEl.value : "");
      const excluded = getExcludedIds(activeCtx) || new Set();
      const roots = hierarchy.children.get("") || [];
      const canShow = (id) => {
        const node = hierarchy.map.get(String(id));
        if (!node) return false;
        if (!keyword) return true;
        if (normalizeText(`${getCode(node.row)} ${node.name}`).includes(keyword)) return true;
        const children = hierarchy.children.get(String(id)) || [];
        return children.some((childId) => canShow(childId));
      };
      let html = `
        <button type="button" class="list-group-item list-group-item-action dept-tree-all ${selectedId ? "" : "active"}" data-id="${emptyId}">
          ${emptyLabel}
        </button>
      `;

      const walk = (id, level) => {
        if (!canShow(id)) return;
        const node = hierarchy.map.get(String(id));
        if (!node) return;
        const children = hierarchy.children.get(String(id)) || [];
        const hasChildren = children.length > 0;
        const isExpanded = expanded.has(String(id)) || Boolean(keyword);
        const isActive = String(selectedId) === String(id);
        const isDisabled = excluded.has(Number(id));
        html += `
          <div class="dept-tree-row ${isActive ? "active" : ""} ${isDisabled ? "opacity-50" : ""}" data-id="${id}" style="--dept-level:${level}">
            <button type="button" class="dept-tree-toggle ${hasChildren ? "" : "is-empty"}" data-toggle-id="${id}">${hasChildren ? (isExpanded ? "▾" : "▸") : ""}</button>
            <button type="button" class="dept-tree-label" data-id="${id}" ${isDisabled ? "disabled" : ""}>${node.name}</button>
          </div>
        `;
        if (hasChildren && isExpanded) {
          children.forEach((childId) => walk(childId, level + 1));
        }
      };
      roots.forEach((id) => walk(id, 0));
      treeEl.innerHTML = html;
    }

    function openPicker(ctx) {
      activeCtx = ctx;
      selectedId = ctx.hiddenEl.value || emptyId;
      searchEl.value = "";
      renderTree();
      renderSelected();
      modal.show();
    }

    function bindContext(ctx) {
      ctx.inputEl.addEventListener("focus", () => {
        renderQuickList(ctx);
        showQuickList(ctx);
      });
      ctx.inputEl.addEventListener("input", () => {
        renderQuickList(ctx);
        showQuickList(ctx);
      });
      ctx.quickEl.addEventListener("mousedown", (e) => e.preventDefault());
      ctx.quickEl.addEventListener("click", (e) => {
        e.stopPropagation();
        const btn = e.target.closest(".dept-quick-option");
        if (!btn) return;
        setValue(ctx, btn.dataset.id || "");
        hideQuickList(ctx);
      });
      const triggerEl = ctx.triggerEl || ctx.openBtn;
      if (!triggerEl) return;
      triggerEl.addEventListener("click", () => {
        hideQuickList(ctx);
        openPicker(ctx);
      });
    }

    contexts.forEach(bindContext);

    treeEl.addEventListener("click", (e) => {
      const allBtn = e.target.closest(".dept-tree-all");
      if (allBtn) {
        selectedId = emptyId;
        renderTree();
        renderSelected();
        return;
      }

      const toggleBtn = e.target.closest(".dept-tree-toggle");
      if (toggleBtn && !toggleBtn.classList.contains("is-empty")) {
        const id = String(toggleBtn.dataset.toggleId || "");
        if (!id) return;
        if (expanded.has(id)) expanded.delete(id);
        else expanded.add(id);
        renderTree();
        return;
      }

      const labelBtn = e.target.closest(".dept-tree-label");
      if (labelBtn && !labelBtn.disabled) {
        selectedId = String(labelBtn.dataset.id || "");
        renderTree();
        renderSelected();
      }
    });

    if (searchEl) {
      searchEl.addEventListener("input", () => renderTree());
    }
    clearBtn.addEventListener("click", () => {
      selectedId = emptyId;
      renderTree();
      renderSelected();
    });
    confirmBtn.addEventListener("click", () => {
      if (!activeCtx) return;
      setValue(activeCtx, selectedId);
      modal.hide();
    });

    document.addEventListener("click", (e) => {
      contexts.forEach((ctx) => {
        if (!ctx.lookupEl.contains(e.target)) hideQuickList(ctx);
      });
    });

    function refresh() {
      hierarchy = createHierarchy(getEntities(), getId, getParentId, getName);
      expanded = new Set();
      contexts.forEach((ctx) => {
        const current = ctx.hiddenEl.value || "";
        setValue(ctx, current);
      });
      if (activeCtx) {
        renderTree();
        renderSelected();
      }
    }

    return { refresh, setValue };
  }

  function createEmployeeSelector(options) {
    const opts = options || {};
    const el = opts.elements || {};
    const lookupEl = el.lookupEl || document.getElementById("employeeLookup");
    const inputEl = el.inputEl || document.getElementById("empSearchInput");
    const hiddenEl = el.hiddenEl || document.getElementById("selectedEmpIds");
    const quickListEl = el.quickListEl || document.getElementById("employeeQuickList");
    const openBtn = el.openBtn || document.getElementById("openEmployeePickerBtn");
    const modalEl = el.modalEl || document.getElementById("employeePickerModal");
    const pickerDeptEl = el.pickerDeptEl || document.getElementById("employeePickerDeptList");
    const pickerSearchEl = el.pickerSearchEl || document.getElementById("employeePickerSearchInput");
    const pickerListEl = el.pickerListEl || document.getElementById("employeePickerList");
    const pickerSelectedListEl = el.pickerSelectedListEl || document.getElementById("employeePickerSelectedList");
    const pickerSelectedCountEl = el.pickerSelectedCountEl || document.getElementById("employeePickerSelectedCount");
    const pickerSelectVisibleEl = el.pickerSelectVisibleEl || document.getElementById("employeePickerSelectVisible");
    const pickerClearBtn = el.pickerClearBtn || document.getElementById("employeePickerClearBtn");
    const pickerConfirmBtn = el.pickerConfirmBtn || document.getElementById("employeePickerConfirmBtn");
    const deptApiUrl = opts.deptApiUrl || "/employee/api/departments";
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    let deptHierarchy = createHierarchy([], (x) => x.id, (x) => x.parent_id, (x) => x.dept_name || "");
    let currentPickerDept = "";
    let expandedDeptIds = new Set();
    let inputEditing = false;
    let quickSearchKeyword = "";

    function rows() {
      return Array.from(pickerListEl.querySelectorAll(".employee-picker-row"));
    }

    function items() {
      return Array.from(pickerListEl.querySelectorAll(".employee-picker-item"));
    }

    function getSelectedIds() {
      const raw = (hiddenEl.value || "").trim();
      if (!raw) return [];
      return raw.split(",").map((x) => x.trim()).filter(Boolean);
    }

    function setSelectedIds(ids) {
      hiddenEl.value = ids.join(",");
    }

    function selectedNamesFromChecked() {
      return rows()
        .filter((row) => row.querySelector(".employee-picker-item")?.checked)
        .map((row) => row.dataset.name || "")
        .filter(Boolean);
    }

    function applyInputSummary() {
      const names = selectedNamesFromChecked();
      inputEl.value = names.length ? (names.length <= 2 ? names.join("，") : `${names.slice(0, 2).join("，")} 等 ${names.length} 人`) : "";
    }

    function persistCheckedSelection() {
      const ids = items()
        .filter((item) => item.checked)
        .map((item) => String(item.dataset.id || "").trim())
        .filter(Boolean);
      setSelectedIds(ids);
    }

    function renderSelectedPanel() {
      const selectedRows = rows().filter((row) => row.querySelector(".employee-picker-item")?.checked);
      pickerSelectedCountEl.textContent = `已选 ${selectedRows.length} 人`;
      if (!selectedRows.length) {
        pickerSelectedListEl.innerHTML = `<div class="employee-selected-empty">暂无已选人员</div>`;
        return;
      }
      pickerSelectedListEl.innerHTML = selectedRows
        .map((row) => {
          const id = row.dataset.id || "";
          const name = row.dataset.name || "";
          const deptName = row.dataset.deptName || "未分配部门";
          return `
            <div class="employee-selected-row">
              <div>
                <div class="employee-selected-main">${name}</div>
                <div class="employee-selected-sub">${deptName}</div>
              </div>
              <button type="button" class="btn btn-sm btn-outline-secondary employee-selected-remove" data-id="${id}">移除</button>
            </div>
          `;
        })
        .join("");
    }

    function visibleRows() {
      return rows().filter((row) => !row.classList.contains("d-none"));
    }

    function syncVisibleSelectAllState() {
      const visible = visibleRows();
      const checked = visible.filter((row) => row.querySelector(".employee-picker-item")?.checked);
      pickerSelectVisibleEl.checked = visible.length > 0 && checked.length === visible.length;
      pickerSelectVisibleEl.indeterminate = checked.length > 0 && checked.length < visible.length;
    }

    function syncSelectedState() {
      const ids = new Set(getSelectedIds());
      items().forEach((item) => {
        item.checked = ids.has(item.dataset.id || "");
      });
      renderSelectedPanel();
      syncVisibleSelectAllState();
      if (!inputEditing) applyInputSummary();
    }

    function showQuickList() {
      quickListEl.classList.add("show");
    }

    function hideQuickList() {
      quickListEl.classList.remove("show");
    }

    function renderQuickList() {
      const keyword = normalizeText(quickSearchKeyword);
      const ids = new Set(getSelectedIds());
      const html = rows()
        .filter((row) => {
          const key = normalizeText(row.dataset.key || "");
          return !keyword || key.includes(keyword);
        })
        .map((row) => {
          const id = String(row.dataset.id || "");
          const active = ids.has(id) ? "active" : "";
          const checked = ids.has(id) ? "checked" : "";
          const label = (row.querySelector(".employee-picker-main")?.textContent || "").trim();
          return `
            <button class="employee-option ${active} quick-employee-option" type="button" data-id="${id}">
              <input class="form-check-input quick-option-check" type="checkbox" tabindex="-1" ${checked} disabled>
              <span class="quick-option-label">${label}</span>
            </button>
          `;
        })
        .join("");
      quickListEl.innerHTML = html || `<div class="small text-muted p-2">无匹配员工</div>`;
    }

    function collectDeptScopeIds(rootDeptId) {
      const root = String(rootDeptId || "");
      if (!root) return null;
      const result = new Set([root]);
      const stack = [root];
      while (stack.length) {
        const node = stack.pop();
        const children = deptHierarchy.children.get(node) || [];
        children.forEach((childId) => {
          if (result.has(childId)) return;
          result.add(childId);
          stack.push(childId);
        });
      }
      return result;
    }

    function applyPickerFilter() {
      const keyword = normalizeText(pickerSearchEl.value);
      const scope = currentPickerDept ? collectDeptScopeIds(currentPickerDept) : null;
      rows().forEach((row) => {
        const key = normalizeText(row.dataset.key || "");
        const deptId = String(row.dataset.deptId || "");
        const deptMatch = !scope || scope.has(deptId);
        const keywordMatch = !keyword || key.includes(keyword);
        row.classList.toggle("d-none", !(deptMatch && keywordMatch));
      });
      syncVisibleSelectAllState();
    }

    function renderDeptTree() {
      const roots = deptHierarchy.children.get("") || [];
      let html = `
        <button type="button" class="list-group-item list-group-item-action dept-tree-all ${currentPickerDept ? "" : "active"}" data-dept-id="">
          全部部门
        </button>
      `;
      const walk = (id, level) => {
        const node = deptHierarchy.map.get(String(id));
        if (!node) return;
        const children = deptHierarchy.children.get(String(id)) || [];
        const hasChildren = children.length > 0;
        const expanded = expandedDeptIds.has(String(id));
        const active = String(currentPickerDept) === String(id);
        html += `
          <div class="dept-tree-row ${active ? "active" : ""}" data-dept-id="${id}" style="--dept-level:${level}">
            <button type="button" class="dept-tree-toggle ${hasChildren ? "" : "is-empty"}" data-toggle-id="${id}">${hasChildren ? (expanded ? "▾" : "▸") : ""}</button>
            <button type="button" class="dept-tree-label" data-dept-id="${id}">${node.name}</button>
          </div>
        `;
        if (hasChildren && expanded) {
          children.forEach((childId) => walk(childId, level + 1));
        }
      };
      roots.forEach((id) => walk(id, 0));
      pickerDeptEl.innerHTML = html;
    }

    async function initDeptFilter() {
      let depts = [];
      try {
        const res = await fetch(deptApiUrl);
        const data = await res.json();
        depts = Array.isArray(data) ? data : [];
      } catch (e) {
        depts = [];
      }
      if (!depts.length) {
        const map = new Map();
        rows().forEach((row) => {
          const id = Number(row.dataset.deptId || 0);
          if (!id || map.has(id)) return;
          map.set(id, {
            id,
            dept_name: row.dataset.deptName || "未分配部门",
            parent_id: Number(row.dataset.parentId || 0) || null,
          });
        });
        depts = Array.from(map.values());
      }
      deptHierarchy = createHierarchy(depts, (x) => x.id, (x) => x.parent_id, (x) => x.dept_name || "");
      expandedDeptIds = new Set();
      renderDeptTree();
    }

    pickerDeptEl.addEventListener("click", (e) => {
      const allBtn = e.target.closest(".dept-tree-all");
      if (allBtn) {
        currentPickerDept = "";
        renderDeptTree();
        applyPickerFilter();
        return;
      }
      const toggleBtn = e.target.closest(".dept-tree-toggle");
      if (toggleBtn && !toggleBtn.classList.contains("is-empty")) {
        const id = String(toggleBtn.dataset.toggleId || "");
        if (!id) return;
        if (expandedDeptIds.has(id)) expandedDeptIds.delete(id);
        else expandedDeptIds.add(id);
        renderDeptTree();
        return;
      }
      const labelBtn = e.target.closest(".dept-tree-label");
      if (labelBtn) {
        currentPickerDept = String(labelBtn.dataset.deptId || "");
        renderDeptTree();
        applyPickerFilter();
      }
    });

    items().forEach((item) => item.addEventListener("change", renderSelectedPanel));
    pickerSearchEl.addEventListener("input", applyPickerFilter);
    pickerSelectVisibleEl.addEventListener("change", (e) => {
      const checked = e.target.checked;
      visibleRows().forEach((row) => {
        const item = row.querySelector(".employee-picker-item");
        if (item) item.checked = checked;
      });
      renderSelectedPanel();
      syncVisibleSelectAllState();
    });
    pickerSelectedListEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".employee-selected-remove");
      if (!btn) return;
      const id = String(btn.dataset.id || "");
      const box = pickerListEl.querySelector(`.employee-picker-item[data-id="${id}"]`);
      if (box) box.checked = false;
      renderSelectedPanel();
      syncVisibleSelectAllState();
    });

    openBtn.addEventListener("click", () => {
      inputEditing = false;
      applyInputSummary();
      hideQuickList();
      syncSelectedState();
      currentPickerDept = "";
      pickerSearchEl.value = "";
      renderDeptTree();
      applyPickerFilter();
      modal.show();
    });

    inputEl.addEventListener("focus", () => {
      inputEditing = true;
      quickSearchKeyword = "";
      inputEl.value = "";
      renderQuickList();
      showQuickList();
    });
    inputEl.addEventListener("input", () => {
      inputEditing = true;
      quickSearchKeyword = inputEl.value;
      renderQuickList();
      showQuickList();
    });

    quickListEl.addEventListener("mousedown", (e) => e.preventDefault());
    quickListEl.addEventListener("click", (e) => {
      e.stopPropagation();
      const btn = e.target.closest(".quick-employee-option");
      if (!btn) return;
      const id = String(btn.dataset.id || "");
      const box = pickerListEl.querySelector(`.employee-picker-item[data-id="${id}"]`);
      if (!box) return;
      box.checked = !box.checked;
      persistCheckedSelection();
      renderSelectedPanel();
      renderQuickList();
      showQuickList();
    });

    pickerClearBtn.addEventListener("click", () => {
      items().forEach((item) => {
        item.checked = false;
      });
      renderSelectedPanel();
    });

    pickerConfirmBtn.addEventListener("click", () => {
      persistCheckedSelection();
      syncSelectedState();
      modal.hide();
    });

    document.addEventListener("click", (e) => {
      if (lookupEl.contains(e.target)) return;
      hideQuickList();
      if (inputEditing) {
        inputEditing = false;
        applyInputSummary();
      }
    });

    async function init() {
      await initDeptFilter();
      applyPickerFilter();
      syncSelectedState();
    }

    return {
      init,
      getSelectedIds,
      setSelectedIds,
      syncSelectedState,
    };
  }

  function createMultiContextEmployeeSelector(options) {
    const opts = options || {};
    const contexts = Array.isArray(opts.contexts) ? opts.contexts : [];
    const modalEl = opts.modalEl;
    const deptTreeEl = opts.deptTreeEl;
    const searchEl = opts.searchEl;
    const listEl = opts.listEl;
    const selectedEl = opts.selectedEl;
    const selectedCountEl = opts.selectedCountEl;
    const selectVisibleEl = opts.selectVisibleEl;
    const clearBtn = opts.clearBtn;
    const confirmBtn = opts.confirmBtn;
    const getEmployees = typeof opts.getEmployees === "function" ? opts.getEmployees : () => [];
    const getDepartments = typeof opts.getDepartments === "function" ? opts.getDepartments : () => [];
    const getEmpId = typeof opts.getEmpId === "function" ? opts.getEmpId : (x) => x?.id;
    const getEmpName = typeof opts.getEmpName === "function" ? opts.getEmpName : (x) => x?.name || "";
    const getEmpCode = typeof opts.getEmpCode === "function" ? opts.getEmpCode : (x) => x?.emp_no || "";
    const getEmpDeptId = typeof opts.getEmpDeptId === "function" ? opts.getEmpDeptId : (x) => x?.dept_id;
    const getEmpDeptName = typeof opts.getEmpDeptName === "function" ? opts.getEmpDeptName : (x) => x?.dept_name || "";
    const getDeptId = typeof opts.getDeptId === "function" ? opts.getDeptId : (x) => x?.id;
    const getDeptParentId = typeof opts.getDeptParentId === "function" ? opts.getDeptParentId : (x) => x?.parent_id;
    const getDeptName = typeof opts.getDeptName === "function" ? opts.getDeptName : (x) => x?.dept_name || "";
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    let hierarchy = createHierarchy([], getDeptId, getDeptParentId, getDeptName);
    let expanded = new Set();
    let activeCtx = null;
    let selectedIds = new Set();
    let groupedRootIds = new Set();
    let deptFilter = "";

    function getCtxIds(ctx) {
      return (ctx.hiddenEl.value || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    }

    function employeeById(id) {
      return getEmployees().find((row) => String(getEmpId(row)) === String(id)) || null;
    }

    function setValue(ctx, ids) {
      const normalized = (Array.isArray(ids) ? ids : [])
        .map((id) => String(id).trim())
        .filter(Boolean);
      ctx.hiddenEl.value = normalized.join(",");
      const names = normalized
        .map((id) => getEmpName(employeeById(id) || {}))
        .filter(Boolean);
      ctx.inputEl.value = names.length ? (names.length <= 2 ? names.join("，") : `${names.slice(0, 2).join("，")} 等 ${names.length} 人`) : "";
    }

    function showQuickList(ctx) {
      ctx.quickEl.classList.add("show");
    }

    function hideQuickList(ctx) {
      ctx.quickEl.classList.remove("show");
    }

    function renderQuickList(ctx) {
      const keyword = normalizeText(ctx.inputEl.value);
      const ids = new Set(getCtxIds(ctx));
      const rows = getEmployees().filter((row) => {
        if (!keyword) return true;
        return normalizeText(`${getEmpCode(row)} ${getEmpName(row)} ${getEmpDeptName(row)}`).includes(keyword);
      });
      ctx.quickEl.innerHTML = rows.length
        ? rows.map((row) => {
            const id = String(getEmpId(row));
            const active = ids.has(id) ? "active" : "";
            const checked = ids.has(id) ? "checked" : "";
            return `
              <button class="employee-option quick-employee-option ${active}" type="button" data-id="${id}">
                <input class="form-check-input quick-option-check" type="checkbox" tabindex="-1" ${checked} disabled>
                <span class="quick-option-label">${getEmpCode(row)} - ${getEmpName(row)}</span>
              </button>
            `;
          }).join("")
        : `<div class="small text-muted p-2">无匹配员工</div>`;
    }

    function collectDeptScopeIds(rootDeptId) {
      const root = String(rootDeptId || "");
      if (!root) return null;
      const result = new Set([root]);
      const stack = [root];
      while (stack.length) {
        const node = stack.pop();
        const children = hierarchy.children.get(node) || [];
        children.forEach((childId) => {
          if (result.has(childId)) return;
          result.add(childId);
          stack.push(childId);
        });
      }
      return result;
    }

    function syncSelectVisibleState() {
      const boxes = Array.from(listEl.querySelectorAll(".account-emp-picker-item"));
      const checked = boxes.filter((box) => box.checked);
      selectVisibleEl.checked = boxes.length > 0 && checked.length === boxes.length;
      selectVisibleEl.indeterminate = checked.length > 0 && checked.length < boxes.length;
    }

    function renderSelected() {
      selectedCountEl.textContent = `已选 ${selectedIds.size} 人`;
      if (!selectedIds.size) {
        selectedEl.innerHTML = `<div class="employee-selected-empty">暂无已选人员</div>`;
        return;
      }
      selectedEl.innerHTML = Array.from(selectedIds)
        .map((id) => {
          const row = employeeById(id);
          if (!row) return "";
          return `
            <div class="employee-selected-row">
              <div>
                <div class="employee-selected-main">${getEmpName(row)}</div>
                <div class="employee-selected-sub">${getEmpDeptName(row) || "未分配部门"}</div>
              </div>
              <button type="button" class="btn btn-sm btn-outline-secondary emp-modal-remove" data-id="${id}">移除</button>
            </div>
          `;
        })
        .filter(Boolean)
        .join("");
    }

    function renderDeptTree() {
      const roots = hierarchy.children.get("") || [];
      let html = `<button type="button" class="list-group-item list-group-item-action dept-tree-all ${deptFilter ? "" : "active"}" data-id="">全部部门</button>`;
      const walk = (id, level) => {
        const node = hierarchy.map.get(String(id));
        if (!node) return;
        const children = hierarchy.children.get(String(id)) || [];
        const hasChildren = children.length > 0;
        const isExpanded = expanded.has(String(id));
        const isActive = String(deptFilter) === String(id);
        html += `
          <div class="dept-tree-row ${isActive ? "active" : ""}" data-id="${id}" style="--dept-level:${level}">
            <button type="button" class="dept-tree-toggle ${hasChildren ? "" : "is-empty"}" data-toggle-id="${id}">${hasChildren ? (isExpanded ? "▾" : "▸") : ""}</button>
            <button type="button" class="dept-tree-label" data-id="${id}">${node.name}</button>
          </div>
        `;
        if (hasChildren && isExpanded) {
          children.forEach((childId) => walk(childId, level + 1));
        }
      };
      roots.forEach((id) => walk(id, 0));
      deptTreeEl.innerHTML = html;
    }

    function renderList() {
      const keyword = normalizeText(searchEl ? searchEl.value : "");
      const scope = deptFilter ? collectDeptScopeIds(deptFilter) : null;
      const rows = getEmployees().filter((row) => {
        const key = normalizeText(`${getEmpCode(row)} ${getEmpName(row)} ${getEmpDeptName(row)}`);
        const deptId = String(getEmpDeptId(row) || "");
        return (!keyword || key.includes(keyword)) && (!scope || scope.has(deptId));
      });
      listEl.innerHTML = rows.length
        ? rows.map((row) => {
            const id = String(getEmpId(row));
            const checked = selectedIds.has(id) ? "checked" : "";
            return `
              <label class="employee-picker-row" data-id="${id}">
                <input class="form-check-input account-emp-picker-item" type="checkbox" data-id="${id}" ${checked}>
                <span class="employee-picker-main">${getEmpCode(row)} - ${getEmpName(row)}</span>
              </label>
            `;
          }).join("")
        : `<div class="employee-selected-empty">无匹配员工</div>`;
      syncSelectVisibleState();
    }

    function openPicker(ctx) {
      activeCtx = ctx;
      selectedIds = new Set(getCtxIds(ctx));
      deptFilter = "";
      expanded = new Set();
      if (searchEl) searchEl.value = "";
      renderDeptTree();
      renderList();
      renderSelected();
      modal.show();
    }

    function bindContext(ctx) {
      ctx.inputEl.addEventListener("focus", () => {
        renderQuickList(ctx);
        showQuickList(ctx);
      });
      ctx.inputEl.addEventListener("input", () => {
        renderQuickList(ctx);
        showQuickList(ctx);
      });
      ctx.quickEl.addEventListener("mousedown", (e) => e.preventDefault());
      ctx.quickEl.addEventListener("click", (e) => {
        e.stopPropagation();
        const btn = e.target.closest(".quick-employee-option");
        if (!btn) return;
        const id = String(btn.dataset.id || "");
        if (!id) return;
        const current = new Set(getCtxIds(ctx));
        if (current.has(id)) current.delete(id);
        else current.add(id);
        setValue(ctx, Array.from(current));
        renderQuickList(ctx);
        showQuickList(ctx);
      });
      const triggerEl = ctx.triggerEl || ctx.openBtn;
      if (triggerEl) {
        triggerEl.addEventListener("click", () => {
          hideQuickList(ctx);
          openPicker(ctx);
        });
      }
    }

    contexts.forEach(bindContext);

    deptTreeEl.addEventListener("click", (e) => {
      const allBtn = e.target.closest(".dept-tree-all");
      if (allBtn) {
        deptFilter = "";
        renderDeptTree();
        renderList();
        return;
      }
      const toggleBtn = e.target.closest(".dept-tree-toggle");
      if (toggleBtn && !toggleBtn.classList.contains("is-empty")) {
        const id = String(toggleBtn.dataset.toggleId || "");
        if (!id) return;
        if (expanded.has(id)) expanded.delete(id);
        else expanded.add(id);
        renderDeptTree();
        return;
      }
      const labelBtn = e.target.closest(".dept-tree-label");
      if (!labelBtn) return;
      deptFilter = String(labelBtn.dataset.id || "");
      renderDeptTree();
      renderList();
    });

    if (searchEl) {
      searchEl.addEventListener("input", () => renderList());
    }
    listEl.addEventListener("change", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement) || !target.classList.contains("account-emp-picker-item")) return;
      const id = String(target.dataset.id || "");
      if (!id) return;
      if (target.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      renderSelected();
      syncSelectVisibleState();
    });
    selectVisibleEl.addEventListener("change", (e) => {
      const checked = e.target.checked;
      Array.from(listEl.querySelectorAll(".account-emp-picker-item")).forEach((box) => {
        const id = String(box.dataset.id || "");
        if (!id) return;
        box.checked = checked;
        if (checked) selectedIds.add(id);
        else selectedIds.delete(id);
      });
      renderSelected();
      syncSelectVisibleState();
    });
    selectedEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".emp-modal-remove");
      if (!btn) return;
      const id = String(btn.dataset.id || "");
      if (!id) return;
      selectedIds.delete(id);
      renderList();
      renderSelected();
    });
    clearBtn.addEventListener("click", () => {
      selectedIds.clear();
      renderList();
      renderSelected();
    });
    confirmBtn.addEventListener("click", () => {
      if (!activeCtx) return;
      setValue(activeCtx, Array.from(selectedIds));
      modal.hide();
    });

    document.addEventListener("click", (e) => {
      contexts.forEach((ctx) => {
        if (!ctx.lookupEl.contains(e.target)) hideQuickList(ctx);
      });
    });

    function refresh() {
      hierarchy = createHierarchy(getDepartments(), getDeptId, getDeptParentId, getDeptName);
      expanded = new Set();
      contexts.forEach((ctx) => {
        setValue(ctx, getCtxIds(ctx));
      });
      if (activeCtx) {
        renderDeptTree();
        renderList();
        renderSelected();
      }
    }

    return { refresh, setValue };
  }

  function createMultiSelectTreeLookup(options) {
    const opts = options || {};
    const contexts = Array.isArray(opts.contexts) ? opts.contexts : [];
    const modalEl = opts.modalEl;
    const treeEl = opts.treeEl;
    const searchEl = opts.searchEl;
    const selectedEl = opts.selectedEl;
    const selectedCountEl = opts.selectedCountEl;
    const selectAllEl = opts.selectAllEl || null;
    const confirmBtn = opts.confirmBtn;
    const clearBtn = opts.clearBtn;
    const getEntities = typeof opts.getEntities === "function" ? opts.getEntities : () => [];
    const getId = typeof opts.getId === "function" ? opts.getId : (x) => x?.id;
    const getParentId = typeof opts.getParentId === "function" ? opts.getParentId : (x) => x?.parent_id;
    const getName = typeof opts.getName === "function" ? opts.getName : (x) => x?.dept_name || "";
    const getCode = typeof opts.getCode === "function" ? opts.getCode : (x) => x?.dept_no || "";
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    const promptModalEl = document.createElement("div");
    promptModalEl.className = "modal fade";
    promptModalEl.tabIndex = -1;
    promptModalEl.setAttribute("aria-hidden", "true");
    promptModalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">选择范围</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="small text-muted">该部门包含下级部门，是否同时包含下级部门？</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-action="exclude">不包含</button>
            <button type="button" class="btn btn-primary" data-action="include">包含</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(promptModalEl);
    const promptModal = bootstrap.Modal.getOrCreateInstance(promptModalEl);

    let hierarchy = createHierarchy([], getId, getParentId, getName);
    let expanded = new Set();
    let activeCtx = null;
    let selectedIds = new Set();

    function entityById(id) {
      return hierarchy.map.get(String(id || ""));
    }

    function collectDescendantIds(rootId) {
      const root = String(rootId || "");
      if (!root) return [];
      const result = [];
      const stack = [...(hierarchy.children.get(root) || [])];
      while (stack.length) {
        const current = String(stack.pop() || "");
        if (!current) continue;
        result.push(current);
        const children = hierarchy.children.get(current) || [];
        children.forEach((childId) => stack.push(String(childId)));
      }
      return result;
    }

    function ensureGroupHidden(ctx) {
      if (ctx.groupHiddenEl) return ctx.groupHiddenEl;
      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = ctx.hiddenEl.name ? `${ctx.hiddenEl.name}_group_roots` : "";
      ctx.groupHiddenEl = hidden;
      ctx.lookupEl.appendChild(hidden);
      return hidden;
    }

    function getCtxGroupIds(ctx) {
      const hidden = ensureGroupHidden(ctx);
      return (hidden.value || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    }

    function getGroupMemberIds(rootId) {
      const root = String(rootId || "");
      if (!root) return [];
      return [root, ...collectDescendantIds(root)];
    }

    function getDisplayIds(ids, groupRoots) {
      const covered = new Set();
      const result = [];
      groupRoots.forEach((rootId) => {
        const key = String(rootId);
        result.push(key);
        getGroupMemberIds(key).forEach((id) => covered.add(String(id)));
      });
      ids.forEach((id) => {
        const key = String(id);
        if (!covered.has(key)) result.push(key);
      });
      return result;
    }

    function removeSelection(id) {
      const currentId = String(id || "");
      if (!currentId) return;
      if (groupedRootIds.has(currentId)) {
        getGroupMemberIds(currentId).forEach((memberId) => selectedIds.delete(String(memberId)));
        groupedRootIds.delete(currentId);
        return;
      }
      selectedIds.delete(currentId);
      Array.from(groupedRootIds).forEach((rootId) => {
        if (getGroupMemberIds(rootId).includes(currentId)) groupedRootIds.delete(rootId);
      });
    }

    function showIncludeChildrenPrompt() {
      return new Promise((resolve) => {
        let resolved = false;
        const cleanup = () => {
          promptModalEl.removeEventListener("hidden.bs.modal", onHidden);
          promptModalEl.querySelector('[data-action="include"]')?.removeEventListener("click", onInclude);
          promptModalEl.querySelector('[data-action="exclude"]')?.removeEventListener("click", onExclude);
        };
        const finish = (value) => {
          if (resolved) return;
          resolved = true;
          cleanup();
          resolve(value);
        };
        const onInclude = () => {
          finish(true);
          promptModal.hide();
        };
        const onExclude = () => {
          finish(false);
          promptModal.hide();
        };
        const onHidden = () => finish(false);
        promptModalEl.querySelector('[data-action="include"]')?.addEventListener("click", onInclude);
        promptModalEl.querySelector('[data-action="exclude"]')?.addEventListener("click", onExclude);
        promptModalEl.addEventListener("hidden.bs.modal", onHidden);
        promptModal.show();
      });
    }

    async function addSelection(id) {
      const currentId = String(id || "");
      if (!currentId) return false;
      const descendants = collectDescendantIds(currentId);
      if (descendants.length) {
        const includeChildren = await showIncludeChildrenPrompt();
        if (includeChildren) {
          descendants.forEach((childId) => selectedIds.add(String(childId)));
          groupedRootIds.add(currentId);
        } else {
          groupedRootIds.delete(currentId);
        }
      }
      selectedIds.add(currentId);
      return true;
    }

    function setValue(ctx, ids, groupRoots) {
      const list = Array.isArray(ids) ? ids : [];
      const normalized = list.map((id) => String(id)).filter(Boolean);
      const normalizedGroups = (Array.isArray(groupRoots) ? groupRoots : [])
        .map((id) => String(id))
        .filter((id) => normalized.includes(id));
      ctx.hiddenEl.value = normalized.join(",");
      ensureGroupHidden(ctx).value = normalizedGroups.join(",");
      const names = getDisplayIds(normalized, normalizedGroups)
        .map((id) => entityById(id)?.name || "")
        .filter(Boolean);
      ctx.inputEl.value = names.length ? (names.length <= 2 ? names.join("，") : `${names.slice(0, 2).join("，")} 等 ${names.length} 项`) : "";
    }

    function getCtxIds(ctx) {
      return (ctx.hiddenEl.value || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    }

    function renderQuickList(ctx) {
      const keyword = normalizeText(ctx.inputEl.value);
      const ids = new Set(getCtxIds(ctx));
      const groupRoots = new Set(getCtxGroupIds(ctx));
      const rows = getEntities().filter((x) => {
        if (!keyword) return true;
        return normalizeText(`${getCode(x)} ${getName(x)}`).includes(keyword);
      });
      ctx.quickEl.innerHTML = rows.length
        ? rows.map((x) => {
            const id = String(getId(x));
            const active = ids.has(id) ? "active" : "";
            const checked = ids.has(id) ? "checked" : "";
            const suffix = groupRoots.has(id) ? "（含下级）" : "";
            return `
              <button class="employee-option quick-employee-option ${active}" type="button" data-id="${id}">
                <input class="form-check-input quick-option-check" type="checkbox" tabindex="-1" ${checked} disabled>
                <span class="quick-option-label">${getName(x)}${suffix} (${getCode(x) || ""})</span>
              </button>
            `;
          }).join("")
        : `<div class="small text-muted p-2">无匹配部门</div>`;
    }

    function showQuickList(ctx) {
      ctx.quickEl.classList.add("show");
    }

    function hideQuickList(ctx) {
      ctx.quickEl.classList.remove("show");
    }

    function renderSelected() {
      selectedCountEl.textContent = `已选 ${selectedIds.size} 项`;
      const displayIds = getDisplayIds(Array.from(selectedIds), Array.from(groupedRootIds));
      if (!displayIds.length) {
        selectedEl.innerHTML = `<div class="employee-selected-empty">暂无已选部门</div>`;
        return;
      }
      selectedEl.innerHTML = displayIds
        .map((id) => {
          const entity = entityById(id);
          if (!entity) return "";
          const childCount = groupedRootIds.has(String(id)) ? collectDescendantIds(id).length : 0;
          return `
            <div class="employee-selected-row">
              <div>
                <div class="employee-selected-main">${entity.name}</div>
                <div class="employee-selected-sub">${groupedRootIds.has(String(id)) ? `含 ${childCount} 个下级部门` : (getCode(entity.row) || "")}</div>
              </div>
              <button type="button" class="btn btn-sm btn-outline-secondary dept-selected-remove" data-id="${id}">移除</button>
            </div>
          `;
        })
        .filter(Boolean)
        .join("");
    }

    function syncSelectAllState() {
      if (!selectAllEl) return;
      const visibleChecks = Array.from(treeEl.querySelectorAll(".dept-tree-check")).filter((el) => !el.disabled);
      const checked = visibleChecks.filter((el) => el.checked);
      selectAllEl.checked = visibleChecks.length > 0 && checked.length === visibleChecks.length;
      selectAllEl.indeterminate = checked.length > 0 && checked.length < visibleChecks.length;
    }

    function renderTree() {
      const keyword = normalizeText(searchEl ? searchEl.value : "");
      const roots = hierarchy.children.get("") || [];
      const canShow = (id) => {
        const node = hierarchy.map.get(String(id));
        if (!node) return false;
        if (!keyword) return true;
        if (normalizeText(`${getCode(node.row)} ${node.name}`).includes(keyword)) return true;
        const children = hierarchy.children.get(String(id)) || [];
        return children.some((childId) => canShow(childId));
      };

      let html = "";
      const walk = (id, level) => {
        if (!canShow(id)) return;
        const node = hierarchy.map.get(String(id));
        if (!node) return;
        const children = hierarchy.children.get(String(id)) || [];
        const hasChildren = children.length > 0;
        const isExpanded = expanded.has(String(id)) || Boolean(keyword);
        const checked = selectedIds.has(String(id)) ? "checked" : "";
        html += `
          <div class="dept-tree-row" data-id="${id}" style="--dept-level:${level}">
            <button type="button" class="dept-tree-toggle ${hasChildren ? "" : "is-empty"}" data-toggle-id="${id}">${hasChildren ? (isExpanded ? "▾" : "▸") : ""}</button>
            <input class="form-check-input dept-tree-check" type="checkbox" data-id="${id}" ${checked}>
            <button type="button" class="dept-tree-label" data-id="${id}">${node.name}</button>
          </div>
        `;
        if (hasChildren && isExpanded) {
          children.forEach((childId) => walk(childId, level + 1));
        }
      };
      roots.forEach((id) => walk(id, 0));
      treeEl.innerHTML = html || `<div class="employee-selected-empty">暂无部门</div>`;
      syncSelectAllState();
    }

    function openPicker(ctx) {
      activeCtx = ctx;
      selectedIds = new Set(getCtxIds(ctx));
      groupedRootIds = new Set(getCtxGroupIds(ctx));
      if (searchEl) searchEl.value = "";
      expanded = new Set();
      renderTree();
      renderSelected();
      modal.show();
    }

    function bindContext(ctx) {
      ctx.inputEl.addEventListener("focus", () => {
        renderQuickList(ctx);
        showQuickList(ctx);
      });
      ctx.inputEl.addEventListener("input", () => {
        renderQuickList(ctx);
        showQuickList(ctx);
      });
      ctx.quickEl.addEventListener("mousedown", (e) => e.preventDefault());
      ctx.quickEl.addEventListener("click", async (e) => {
        e.stopPropagation();
        const btn = e.target.closest(".quick-employee-option");
        if (!btn) return;
        const id = String(btn.dataset.id || "");
        if (!id) return;
        const current = new Set(getCtxIds(ctx));
        const currentGroups = new Set(getCtxGroupIds(ctx));
        if (current.has(id)) {
          current.delete(id);
          currentGroups.delete(id);
          Array.from(currentGroups).forEach((rootId) => {
            if (getGroupMemberIds(rootId).includes(id)) currentGroups.delete(rootId);
          });
        }
        else {
          current.add(id);
          const descendants = collectDescendantIds(id);
          if (descendants.length) {
            const includeChildren = await showIncludeChildrenPrompt();
            if (includeChildren) {
              descendants.forEach((childId) => current.add(String(childId)));
              currentGroups.add(id);
            }
          }
        }
        setValue(ctx, Array.from(current), Array.from(currentGroups));
        renderQuickList(ctx);
        showQuickList(ctx);
      });
      const triggerEl = ctx.triggerEl || ctx.openBtn;
      if (!triggerEl) return;
      triggerEl.addEventListener("click", () => {
        hideQuickList(ctx);
        openPicker(ctx);
      });
    }

    contexts.forEach(bindContext);

    treeEl.addEventListener("click", async (e) => {
      const toggleBtn = e.target.closest(".dept-tree-toggle");
      if (toggleBtn && !toggleBtn.classList.contains("is-empty")) {
        const id = String(toggleBtn.dataset.toggleId || "");
        if (!id) return;
        if (expanded.has(id)) expanded.delete(id);
        else expanded.add(id);
        renderTree();
        return;
      }

      const labelBtn = e.target.closest(".dept-tree-label");
      if (labelBtn) {
        const id = String(labelBtn.dataset.id || "");
        if (!id) return;
        if (selectedIds.has(id)) removeSelection(id);
        else await addSelection(id);
        renderTree();
        renderSelected();
      }
    });

    treeEl.addEventListener("change", async (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement) || !target.classList.contains("dept-tree-check")) return;
      const id = String(target.dataset.id || "");
      if (!id) return;
      if (target.checked) await addSelection(id);
      else removeSelection(id);
      renderTree();
      renderSelected();
    });

    if (searchEl) {
      searchEl.addEventListener("input", () => renderTree());
    }
    if (selectAllEl) {
      selectAllEl.addEventListener("change", (e) => {
        const checked = e.target.checked;
        const visibleChecks = Array.from(treeEl.querySelectorAll(".dept-tree-check"));
        visibleChecks.forEach((box) => {
          const id = String(box.dataset.id || "");
          if (!id) return;
          if (checked) selectedIds.add(id);
          else selectedIds.delete(id);
        });
        renderTree();
        renderSelected();
      });
    }
    selectedEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".dept-selected-remove");
      if (!btn) return;
      const id = String(btn.dataset.id || "");
      if (!id) return;
      removeSelection(id);
      renderTree();
      renderSelected();
    });
    clearBtn.addEventListener("click", () => {
      selectedIds.clear();
      groupedRootIds.clear();
      renderTree();
      renderSelected();
    });
    confirmBtn.addEventListener("click", () => {
      if (!activeCtx) return;
      setValue(activeCtx, Array.from(selectedIds), Array.from(groupedRootIds));
      modal.hide();
    });

    document.addEventListener("click", (e) => {
      contexts.forEach((ctx) => {
        if (!ctx.lookupEl.contains(e.target)) hideQuickList(ctx);
      });
    });

    function refresh() {
      hierarchy = createHierarchy(getEntities(), getId, getParentId, getName);
      expanded = new Set();
      contexts.forEach((ctx) => {
        setValue(ctx, getCtxIds(ctx), getCtxGroupIds(ctx));
      });
      if (activeCtx) {
        renderTree();
        renderSelected();
      }
    }

    return { refresh, setValue };
  }

  function createMultiChecklist(options) {
    const opts = options || {};
    const containerEl = opts.containerEl;
    const searchEl = opts.searchEl || null;
    const extraFilterEl = opts.extraFilterEl || null;
    const getItems = typeof opts.getItems === "function" ? opts.getItems : () => [];
    const getId = typeof opts.getId === "function" ? opts.getId : (x) => x?.id;
    const getKey = typeof opts.getKey === "function" ? opts.getKey : () => "";
    const renderLabel = typeof opts.renderLabel === "function" ? opts.renderLabel : (x) => String(getId(x));
    const extraFilter = typeof opts.extraFilter === "function" ? opts.extraFilter : () => true;
    const inputName = opts.inputName || "ids";

    let selected = new Set((opts.initialSelectedIds || []).map((x) => Number(x)));

    function getKeyword() {
      return normalizeText(searchEl ? searchEl.value : "");
    }

    function render() {
      const keyword = getKeyword();
      const rows = getItems().filter((x) => {
        const key = normalizeText(getKey(x));
        const passKeyword = !keyword || key.includes(keyword);
        return passKeyword && extraFilter(x, extraFilterEl ? extraFilterEl.value : "");
      });
      containerEl.innerHTML = rows
        .map((x) => {
          const id = Number(getId(x));
          const checked = selected.has(id) ? "checked" : "";
          return `
            <label class="d-block small mb-1">
              <input type="checkbox" name="${inputName}" value="${id}" ${checked}>
              ${renderLabel(x)}
            </label>
          `;
        })
        .join("") || `<div class="small text-muted">无匹配数据</div>`;
    }

    function setSelected(ids) {
      selected = new Set((ids || []).map((x) => Number(x)));
      render();
    }

    function getSelected() {
      return Array.from(selected);
    }

    if (searchEl) searchEl.addEventListener("input", render);
    if (extraFilterEl) extraFilterEl.addEventListener("change", render);
    containerEl.addEventListener("change", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;
      const id = Number(target.value || 0);
      if (!id) return;
      if (target.checked) selected.add(id);
      else selected.delete(id);
    });

    render();
    return { render, setSelected, getSelected };
  }

  window.SelectorComponent = {
    normalizeText,
    createSingleSelectTreeLookup,
    createMultiSelectTreeLookup,
    createEmployeeSelector,
    createMultiContextEmployeeSelector,
    createMultiChecklist,
  };
})();
