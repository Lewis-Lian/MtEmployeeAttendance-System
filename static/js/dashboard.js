function ymNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function summaryCard(title, value, unit = '') {
  return `<div class="col-md-3"><div class="card summary-card"><div class="card-body"><div class="text-muted">${title}</div><div class="fs-4 fw-bold">${value}${unit}</div></div></div></div>`;
}

async function loadAll() {
  const empId = document.getElementById('empSelect').value;
  const month = document.getElementById('monthInput').value || ymNow();

  const summaryRes = await fetch(`/employee/api/summary?emp_id=${empId}&month=${month}`);
  const summary = await summaryRes.json();

  const cards = [
    summaryCard('应出勤小时', summary.monthly.expected_hours, 'h'),
    summaryCard('实出勤小时', summary.monthly.actual_hours, 'h'),
    summaryCard('旷工小时', summary.monthly.absent_hours, 'h'),
    summaryCard('加班小时', summary.monthly.overtime_hours, 'h'),
    summaryCard('迟到分钟', summary.monthly.late_minutes, 'm'),
    summaryCard('早退分钟', summary.monthly.early_leave_minutes, 'm'),
    summaryCard('本月扣款估算', summary.deduction.total_penalty, '元'),
    summaryCard('年假余额', summary.annual_leave.remaining_days, '天'),
  ];
  document.getElementById('summaryCards').innerHTML = cards.join('');

  const dailyRes = await fetch(`/employee/api/daily-records?emp_id=${empId}&month=${month}`);
  const daily = await dailyRes.json();
  document.querySelector('#dailyTable tbody').innerHTML = daily.map(r =>
    `<tr><td>${r.date}</td><td>${r.expected_hours}</td><td>${r.actual_hours}</td><td>${r.absent_hours}</td><td>${r.leave_hours}(${r.leave_type || ''})</td><td>${r.overtime_hours}</td><td>${r.late_minutes}</td><td>${r.early_leave_minutes}</td><td>${r.exception_reason || ''}</td></tr>`
  ).join('');

  const overtimeRes = await fetch(`/employee/api/overtime?emp_id=${empId}`);
  const overtime = await overtimeRes.json();
  document.getElementById('overtimeList').innerHTML = overtime.slice(0, 10).map(o =>
    `<li class="list-group-item"><div>${o.overtime_no} (${o.effective_hours}h)</div><div class="text-muted small">${o.start_time || ''} ~ ${o.end_time || ''}</div></li>`
  ).join('') || '<li class="list-group-item text-muted">暂无数据</li>';

  const leaveRes = await fetch(`/employee/api/leave?emp_id=${empId}`);
  const leave = await leaveRes.json();
  document.getElementById('leaveList').innerHTML = leave.slice(0, 10).map(l =>
    `<li class="list-group-item"><div>${l.leave_type} (${l.duration}h)</div><div class="text-muted small">${l.start_time || ''} ~ ${l.end_time || ''}</div></li>`
  ).join('') || '<li class="list-group-item text-muted">暂无数据</li>';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('monthInput').value = ymNow();
  document.getElementById('refreshBtn').addEventListener('click', loadAll);
  loadAll();
});
