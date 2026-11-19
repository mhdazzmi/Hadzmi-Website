/* =========================================================
   05 · TO-DO — iOS Reminders style (smart lists, groups, sheet editor)
   Status: '' = Pending, 'On Progress', 'Done'  (sama dengan versi lama)
   ========================================================= */
let taFilterStatus = 'active';

const TA_SMART = [
  { key: 'active', label: 'To Do', icon: 'fa-inbox', color: '#007AFF' },
  { key: 'today', label: 'Hari Ini', icon: 'fa-calendar-day', color: '#5856D6' },
  { key: 'On Progress', label: 'In Progress', icon: 'fa-spinner', color: '#FF9500' },
  { key: 'overdue', label: 'Terlambat', icon: 'fa-triangle-exclamation', color: '#FF3B30' },
  { key: 'Done', label: 'Selesai', icon: 'fa-check', color: '#8E8E93' },
  { key: 'all', label: 'Semua', icon: 'fa-layer-group', color: '#1C1C1E' }
];

function taDueEpoch(t) {
  if (!t.deadline) return null;
  return t.time ? wibToEpoch(t.deadline, t.time) : wibToEpoch(t.deadline, '23:59') + 59000;
}
function taIsOverdue(t) { const d = taDueEpoch(t); return t.status !== 'Done' && d !== null && Date.now() > d; }
function taMatches(t, filter) {
  const today = wibDateStr();
  if (filter === 'active') return t.status !== 'Done';
  if (filter === 'today') return t.status !== 'Done' && t.deadline === today;
  if (filter === 'On Progress') return t.status === 'On Progress';
  if (filter === 'overdue') return taIsOverdue(t);
  if (filter === 'Done') return t.status === 'Done';
  return true;
}

function taSetFilter(status) {
  taFilterStatus = status;
  taRenderNotes();
}

function renderTaSmartGrid() {
  const grid = $('taSmartGrid'); if (!grid) return;
  grid.innerHTML = TA_SMART.map(s => {
    const count = appState.todos.filter(t => taMatches(t, s.key)).length;
    return `<button class="smart-card ${taFilterStatus === s.key ? 'active' : ''}" style="color:${s.color}" onclick="taSetFilter('${s.key}')">
      <div class="top"><span class="icon-tile" style="background:${s.color}"><i class="fas ${s.icon}"></i></span><span class="count">${count}</span></div>
      <span class="name">${s.label}</span></button>`;
  }).join('');
}

function taGroupOf(t) {
  if (t.status === 'Done') return 'done';
  if (taIsOverdue(t)) return 'overdue';
  if (!t.deadline) return 'nodate';
  const today = wibDateStr();
  if (t.deadline === today) return 'today';
  if (t.deadline === wibAddDays(1)) return 'tomorrow';
  return 'upcoming';
}
const TA_GROUPS = [
  ['overdue', 'Terlambat', 'var(--red)'], ['today', 'Hari Ini', 'var(--indigo)'], ['tomorrow', 'Besok', 'var(--blue)'],
  ['upcoming', 'Mendatang', 'var(--label)'], ['nodate', 'Tanpa Tanggal', 'var(--label2)'], ['done', 'Selesai', 'var(--label2)']
];

function taRowHTML(item) {
  const isDone = item.status === 'Done', isProg = item.status === 'On Progress', high = item.priority === 'High';
  const overdue = taIsOverdue(item);
  const links = (item.links || []).filter(Boolean);
  const dateText = item.deadline ? `${relativeDayLabel(item.deadline)}${item.time ? ', ' + item.time : ''}` : '';
  const id = esc(item.id);
  return `
  <div class="row-wrap swipe" data-id="${id}">
    <div class="swipe-actions">
      <button style="background:var(--orange)" onclick="taCycleStatus('${id}')"><i class="fas fa-circle-half-stroke"></i>${isProg ? 'Pending' : 'Proses'}</button>
      <button style="background:var(--red)" onclick="taDeleteNote('${id}')"><i class="fas fa-trash"></i>Hapus</button>
    </div>
    <div class="row task-row swipe-front ${isDone ? 'is-done' : ''}">
      <button class="check ${isDone ? 'done' : ''} ${high && !isDone ? 'high' : ''} ${isProg ? 'prog' : ''}" onclick="taToggleDone('${id}', this)" aria-label="Tandai selesai"><i class="fas fa-check"></i></button>
      <div class="flex-1 tappable" onclick="taEditTask('${id}')" style="cursor:pointer">
        <div class="t-title">${high && !isDone ? '<span class="flag">!! </span>' : ''}${esc(item.title)}</div>
        ${item.desc ? `<div class="t-notes clamp2">${esc(item.desc)}</div>` : ''}
        ${links.length ? `<div class="t-links" onclick="event.stopPropagation()">${links.slice(0, 3).map(l => `<a href="${safeUrl(l)}" target="_blank" rel="noopener" class="truncate"><i class="fas fa-link" style="font-size:11px"></i> ${esc(l.replace(/^https?:\/\//, ''))}</a>`).join('')}${links.length > 3 ? `<span class="t-cap muted">+${links.length - 3} link lainnya</span>` : ''}</div>` : ''}
        ${(dateText || isProg) ? `<div class="t-meta">
          ${dateText ? `<span class="${overdue ? 'overdue' : ''}"><i class="far fa-calendar"></i> ${esc(dateText)}</span>` : ''}
          ${isProg ? `<span class="badge tint-orange">In Progress</span>` : ''}
        </div>` : ''}
      </div>
      <button class="icon-btn sm clear" onclick="taOpenActions('${id}')" aria-label="Opsi"><i class="fas fa-circle-info" style="font-size:18px"></i></button>
    </div>
  </div>`;
}

function taRenderNotes() {
  renderTaSmartGrid();
  const container = $('ta-notes-container'); if (!container) return;
  const search = ($('ta-search') ? $('ta-search').value : '').toLowerCase();
  const smart = TA_SMART.find(s => s.key === taFilterStatus) || TA_SMART[0];
  if ($('taListTitle')) { $('taListTitle').textContent = smart.label; $('taListTitle').style.color = smart.color; }

  const filtered = appState.todos.filter(t => {
    const matchesSearch = (t.title || '').toLowerCase().includes(search) || (t.desc || '').toLowerCase().includes(search);
    return matchesSearch && taMatches(t, taFilterStatus);
  });
  $('ta-total-notes').textContent = `${filtered.length} dari ${appState.todos.length} tugas`;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="list"><div class="empty"><i class="far fa-circle-check"></i><div class="e-title">${search ? 'Tidak ditemukan' : 'Tidak ada tugas'}</div><div class="e-sub">${search ? 'Coba kata kunci lain.' : 'Tap “Pengingat Baru” untuk menambah.'}</div></div></div>`;
    return;
  }

  const groups = {};
  filtered.forEach(t => { const g = taGroupOf(t); (groups[g] = groups[g] || []).push(t); });
  const sortFn = (a, b) => {
    const da = taDueEpoch(a), db = taDueEpoch(b);
    if (da !== db) return (da === null ? Infinity : da) - (db === null ? Infinity : db);
    return (b.priority === 'High') - (a.priority === 'High');
  };
  const showHeaders = Object.keys(groups).length > 1 || !['Done'].includes(taFilterStatus);
  container.innerHTML = TA_GROUPS.filter(([k]) => groups[k]).map(([k, label, color]) => {
    const items = k === 'done' || k === 'nodate' ? groups[k] : groups[k].slice().sort(sortFn);
    return `${showHeaders ? `<div class="task-group-title" style="color:${color}"><span>${label}</span><span class="t-foot muted" style="font-weight:500">${items.length}</span></div>` : ''}
      <div class="list">${items.map(taRowHTML).join('')}</div>`;
  }).join('');
  bindSwipeRows(container);
}

// ---------- Swipe-to-reveal ----------
function bindSwipeRows(scope) {
  scope.querySelectorAll('.swipe').forEach(wrap => {
    const front = wrap.querySelector('.swipe-front'); if (!front || front.dataset.sw) return;
    front.dataset.sw = '1';
    let x0 = 0, y0 = 0, dx = 0, active = false, horiz = null;
    const MAX = 152;
    front.addEventListener('touchstart', e => {
      scope.querySelectorAll('.swipe-front').forEach(f => { if (f !== front) f.style.transform = ''; });
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; active = true; horiz = null;
      front.style.transition = 'none';
    }, { passive: true });
    front.addEventListener('touchmove', e => {
      if (!active) return;
      const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
      if (horiz === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) horiz = Math.abs(mx) > Math.abs(my);
      if (!horiz) return;
      const base = front.dataset.open === '1' ? -MAX : 0;
      dx = Math.min(0, Math.max(-MAX - 30, base + mx));
      front.style.transform = `translateX(${dx}px)`;
    }, { passive: true });
    front.addEventListener('touchend', () => {
      active = false; front.style.transition = '';
      if (!horiz) return;
      const open = dx < -MAX / 2;
      front.dataset.open = open ? '1' : '';
      front.style.transform = open ? `translateX(-${MAX}px)` : '';
    });
  });
}

// ---------- Actions ----------
function taToggleDone(id, el) {
  const item = appState.todos.find(t => t.id === id); if (!item) return;
  if (el) { el.classList.add('done', 'pop'); }
  haptic(10);
  setTimeout(() => taUpdateStatus(id, item.status === 'Done' ? '' : 'Done'), el ? 260 : 0);
}
function taCycleStatus(id) {
  const item = appState.todos.find(t => t.id === id); if (!item) return;
  taUpdateStatus(id, item.status === 'On Progress' ? '' : 'On Progress');
}
function taUpdateStatus(id, newStatus) {
  const item = appState.todos.find(t => t.id === id);
  if (item) {
    item.status = newStatus;
    saveStateToLocal(); taRenderNotes(); renderDashboardStats(); renderDashboardTodayAgenda();
    showToast('Task status updated & synced.');
  }
}
function taOpenActions(id) {
  const item = appState.todos.find(t => t.id === id); if (!item) return;
  const actions = [];
  if (item.status !== 'Done') actions.push({ text: 'Tandai Selesai', icon: 'fas fa-circle-check', onClick: () => taUpdateStatus(id, 'Done') });
  if (item.status !== 'On Progress') actions.push({ text: 'Tandai In Progress', icon: 'fas fa-circle-half-stroke', onClick: () => taUpdateStatus(id, 'On Progress') });
  if (item.status) actions.push({ text: 'Kembalikan ke Pending', icon: 'far fa-circle', onClick: () => taUpdateStatus(id, '') });
  actions.push({ text: 'Edit Detail', icon: 'fas fa-pen', onClick: () => taEditTask(id) });
  actions.push({ text: 'Kirim ke Gmail', icon: 'fas fa-envelope', onClick: () => shareTask(id) });
  actions.push({ text: 'Hapus', icon: 'fas fa-trash', destructive: true, onClick: () => taDeleteNote(id) });
  openActionSheet({ title: item.title, message: item.deadline ? `Deadline: ${relativeDayLabel(item.deadline)}${item.time ? ' ' + item.time : ''}` : 'Tanpa deadline', actions });
}

// ---------- Editor sheet ----------
function taLinkRowHTML(val) {
  return `<div class="inline-input-row"><input type="url" value="${esc(val)}" placeholder="https://…" class="ta-link-input field" style="padding:10px 12px"><button type="button" onclick="this.parentElement.remove()" class="icon-btn sm red"><i class="fas fa-minus"></i></button></div>`;
}
function taAddLinkInput(val = '') {
  const c = $('ta-links-inputs-container');
  c.insertAdjacentHTML('beforeend', taLinkRowHTML(val));
}
function taOpenNewSheet() {
  taResetForm();
  if (taFilterStatus === 'today') $('ta-deadline').value = wibDateStr();
  if (taFilterStatus === 'On Progress') $('ta-status').value = 'On Progress';
  openSheet('sheetTask');
  setTimeout(() => $('ta-title').focus(), 350);
}
function taSaveNote() {
  const title = $('ta-title').value.trim();
  if (!title) return showToast('Task title is required!', false);
  const links = Array.from(document.querySelectorAll('.ta-link-input')).map(el => el.value.trim()).filter(v => v !== '');
  const editId = $('ta-edit-id').value;
  const data = {
    title, desc: $('ta-desc').value.trim(), deadline: $('ta-deadline').value, time: $('ta-time').value,
    status: $('ta-status').value, links, priority: $('ta-priority').value || 'Normal'
  };
  if (editId) {
    const item = appState.todos.find(t => t.id === editId);
    if (item) Object.assign(item, data);
    showToast('Task updated successfully & synced!');
  } else {
    appState.todos.unshift(Object.assign({ id: 'td_' + Date.now() }, data));
    showToast('Task created successfully & synced!');
  }
  saveStateToLocal(); taResetForm(); taRenderNotes(); renderDashboardStats(); renderDashboardTodayAgenda();
  closeSheet('sheetTask');
}
function taResetForm() {
  $('ta-edit-id').value = ''; $('ta-title').value = ''; $('ta-desc').value = ''; $('ta-deadline').value = ''; $('ta-time').value = '';
  $('ta-status').value = ''; $('ta-priority').value = 'Normal';
  $('ta-links-inputs-container').innerHTML = taLinkRowHTML('');
  $('ta-form-title').textContent = 'Pengingat Baru';
  $('ta-main-btn').textContent = 'Tambah';
  $('ta-delete-in-sheet').classList.add('hidden');
}
function taEditTask(id) {
  const item = appState.todos.find(t => t.id === id); if (!item) return;
  $('ta-edit-id').value = item.id; $('ta-title').value = item.title || '';
  $('ta-desc').value = item.desc || ''; $('ta-deadline').value = item.deadline || '';
  $('ta-time').value = item.time || ''; $('ta-status').value = item.status || '';
  $('ta-priority').value = item.priority === 'High' ? 'High' : 'Normal';
  const c = $('ta-links-inputs-container'); c.innerHTML = '';
  if (item.links && item.links.length > 0) item.links.forEach(l => taAddLinkInput(l)); else taAddLinkInput('');
  $('ta-form-title').textContent = 'Detail Tugas';
  $('ta-main-btn').textContent = 'Simpan';
  $('ta-delete-in-sheet').classList.remove('hidden');
  openSheet('sheetTask');
}
async function taDeleteNote(id) {
  const item = appState.todos.find(t => t.id === id); if (!item) return;
  if (!(await iosConfirm('Hapus tugas?', item.title, 'Hapus', true))) { taRenderNotes(); return false; }
  appState.todos = appState.todos.filter(t => t.id !== id);
  saveStateToLocal(); taRenderNotes(); renderDashboardStats(); renderDashboardTodayAgenda();
  showToast('Task deleted & synced.');
  return true;
}
async function taDeleteFromSheet() {
  const id = $('ta-edit-id').value; if (!id) return;
  if (await taDeleteNote(id)) { taResetForm(); closeSheet('sheetTask'); }
}
