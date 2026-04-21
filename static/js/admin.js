document.addEventListener('DOMContentLoaded', () => {
  const uploadForm = document.getElementById('uploadForm');
  const shiftForm = document.getElementById('shiftForm');
  const readonlyUserForm = document.getElementById('readonlyUserForm');

  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(uploadForm);
    const res = await fetch('/admin/upload', { method: 'POST', body: formData });
    const data = await res.json();
    document.getElementById('uploadResult').textContent = JSON.stringify(data, null, 2);
  });

  shiftForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(shiftForm);
    let timeSlots = [];
    try {
      timeSlots = JSON.parse(fd.get('time_slots') || '[]');
    } catch {
      alert('time_slots 需要合法 JSON');
      return;
    }

    const payload = {
      shift_no: fd.get('shift_no'),
      shift_name: fd.get('shift_name'),
      time_slots: timeSlots,
      is_cross_day: false,
    };

    const res = await fetch('/admin/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    alert(data.status === 'ok' ? '班次已保存' : data.error);
  });

  readonlyUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(readonlyUserForm);
    const selected = Array.from(readonlyUserForm.querySelector('[name="emp_ids"]').selectedOptions).map(x => Number(x.value));
    const payload = {
      username: fd.get('username'),
      password: fd.get('password'),
      emp_ids: selected,
    };

    const res = await fetch('/admin/users/readonly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    document.getElementById('userResult').textContent = JSON.stringify(data, null, 2);
  });

  document.getElementById('exportMonth').value = new Date().toISOString().slice(0, 7);
  document.getElementById('exportBtn').addEventListener('click', () => {
    const month = document.getElementById('exportMonth').value;
    window.location.href = `/admin/export/daily?month=${month}`;
  });
});
