document.addEventListener("DOMContentLoaded", () => {
  const createForm = document.getElementById("createShiftForm");
  const createResult = document.getElementById("createShiftResult");
  const createSlotList = document.getElementById("createSlotList");
  const createAddSlotBtn = document.getElementById("createAddSlotBtn");
  const tableBody = document.getElementById("shiftTableBody");
  const refreshBtn = document.getElementById("refreshShiftsBtn");

  const editForm = document.getElementById("editShiftForm");
  const editSlotList = document.getElementById("editSlotList");
  const editAddSlotBtn = document.getElementById("editAddSlotBtn");
  const saveShiftBtn = document.getElementById("saveShiftBtn");
  const editModal = new bootstrap.Modal(document.getElementById("editShiftModal"));

  let shifts = [];
  window.AppFeedback.setResult(createResult, "", "muted");

  function slotRow(start = "", end = "") {
    const row = document.createElement("div");
    row.className = "row g-2 slot-row";
    row.innerHTML = `
      <div class="col-5"><input class="form-control" type="time" name="slot_start" value="${start}" required></div>
      <div class="col-5"><input class="form-control" type="time" name="slot_end" value="${end}" required></div>
      <div class="col-2"><button class="btn btn-outline-danger w-100 remove-slot-btn" type="button">删</button></div>
    `;
    return row;
  }

  function ensureAtLeastOne(container) {
    if (!container.querySelector(".slot-row")) {
      container.appendChild(slotRow());
    }
  }

  function bindSlotRemove(container) {
    container.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLButtonElement)) return;
      if (!target.classList.contains("remove-slot-btn")) return;
      const rows = container.querySelectorAll(".slot-row");
      if (rows.length <= 1) {
        window.AppDialog.alert("至少保留一个时间段");
        return;
      }
      const row = target.closest(".slot-row");
      if (row) row.remove();
    });
  }

  function collectSlots(container) {
    const rows = Array.from(container.querySelectorAll(".slot-row"));
    const slots = [];
    for (const row of rows) {
      const start = row.querySelector('[name="slot_start"]').value;
      const end = row.querySelector('[name="slot_end"]').value;
      if (!start || !end) {
        throw new Error("请完整填写每个时间段");
      }
      slots.push([start, end]);
    }
    return slots;
  }

  function renderTable() {
    tableBody.innerHTML = "";
    for (const shift of shifts) {
      const slots = (shift.time_slots || []).map((x) => `${x[0]}-${x[1]}`).join("；") || "-";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${shift.id}</td>
        <td>${shift.shift_no}</td>
        <td>${shift.shift_name}</td>
        <td>${slots}</td>
        <td>${shift.is_cross_day ? "是" : "否"}</td>
        <td class="d-flex gap-1">
          <button class="btn btn-sm btn-outline-primary edit-shift-btn" data-id="${shift.id}">编辑</button>
          <button class="btn btn-sm btn-outline-danger delete-shift-btn" data-id="${shift.id}">删除</button>
        </td>
      `;
      tableBody.appendChild(tr);
    }
  }

  async function loadShifts() {
    const res = await fetch("/admin/shifts");
    const data = await res.json();
    shifts = Array.isArray(data) ? data : [];
    renderTable();
  }

  createAddSlotBtn.addEventListener("click", () => createSlotList.appendChild(slotRow()));
  editAddSlotBtn.addEventListener("click", () => editSlotList.appendChild(slotRow()));

  bindSlotRemove(createSlotList);
  bindSlotRemove(editSlotList);
  ensureAtLeastOne(createSlotList);
  ensureAtLeastOne(editSlotList);

  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    let timeSlots = [];
    try {
      timeSlots = collectSlots(createSlotList);
    } catch (err) {
      window.AppDialog.alert(err.message, "校验失败");
      return;
    }
    const fd = new FormData(createForm);
    const payload = {
      shift_no: fd.get("shift_no"),
      shift_name: fd.get("shift_name"),
      is_cross_day: !!fd.get("is_cross_day"),
      time_slots: timeSlots,
    };
    const res = await fetch("/admin/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      window.AppFeedback.setResult(createResult, data.error || "创建失败", "danger");
      window.AppToast.error(data.error || "创建失败", "创建班次失败");
      return;
    }
    window.AppFeedback.setResult(createResult, "创建成功", "success");
    window.AppToast.success("创建成功", "创建班次成功");
    createForm.reset();
    createSlotList.innerHTML = "";
    createSlotList.appendChild(slotRow());
    await loadShifts();
  });

  tableBody.addEventListener("click", async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const id = Number(target.dataset.id);
    const shift = shifts.find((x) => x.id === id);
    if (!shift) return;

    if (target.classList.contains("edit-shift-btn")) {
      editForm.querySelector('[name="id"]').value = String(shift.id);
      editForm.querySelector('[name="shift_no"]').value = shift.shift_no;
      editForm.querySelector('[name="shift_name"]').value = shift.shift_name;
      editForm.querySelector('[name="is_cross_day"]').checked = !!shift.is_cross_day;
      editSlotList.innerHTML = "";
      const slots = shift.time_slots && shift.time_slots.length ? shift.time_slots : [["", ""]];
      for (const slot of slots) {
        editSlotList.appendChild(slotRow(slot[0] || "", slot[1] || ""));
      }
      ensureAtLeastOne(editSlotList);
      editModal.show();
      return;
    }

    if (target.classList.contains("delete-shift-btn")) {
      if (!(await window.AppDialog.confirm(`确认删除班次 ${shift.shift_no} 吗？`, "删除班次"))) return;
      const res = await fetch(`/admin/shifts/${shift.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        window.AppDialog.alert(data.error || "删除失败", "删除失败");
        return;
      }
      await loadShifts();
    }
  });

  saveShiftBtn.addEventListener("click", async () => {
    const id = Number(editForm.querySelector('[name="id"]').value);
    let timeSlots = [];
    try {
      timeSlots = collectSlots(editSlotList);
    } catch (err) {
      window.AppDialog.alert(err.message, "校验失败");
      return;
    }
    const payload = {
      shift_no: editForm.querySelector('[name="shift_no"]').value,
      shift_name: editForm.querySelector('[name="shift_name"]').value,
      is_cross_day: editForm.querySelector('[name="is_cross_day"]').checked,
      time_slots: timeSlots,
    };
    const res = await fetch(`/admin/shifts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      window.AppDialog.alert(data.error || "更新失败", "更新失败");
      return;
    }
    editModal.hide();
    await loadShifts();
  });

  refreshBtn.addEventListener("click", loadShifts);
  loadShifts();
});
