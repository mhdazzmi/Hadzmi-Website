/* =========================================================
   03 · DASHBOARD — greeting, stats, agenda, widgets, web links
   ========================================================= */
function updateHeaderDate() {
  const w = getWIBDate();
  const el = $('currentDateHeader');
  if (el) el.textContent = `${ID_DAYS[w.getDay()]}, ${w.getDate()} ${ID_MONTHS_LONG[w.getMonth()]} ${w.getFullYear()}`;
}

function updateRealtimeClock() {
  const w = getWIBDate();
  const clock = $('heroClock');
  if (clock) clock.innerHTML = `${pad2(w.getHours())}:${pad2(w.getMinutes())}<span class="sec">:${pad2(w.getSeconds())}</span>`;
  if (w.getSeconds() === 0) { updateDashboardGreeting(); updateHeaderDate(); }
}

const SKY_ICONS = {
  morning: `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#FDE68A" stroke-width="1.6" style="animation:spin 30s linear infinite"><circle cx="12" cy="12" r="4.5" fill="#FDE68A"/><path stroke-linecap="round" d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.36-6.36-1.42 1.42M7.05 16.95l-1.41 1.41m12.72 0-1.41-1.41M7.05 7.05 5.64 5.64"/></svg>`,
  noon: `<svg width="64" height="64" viewBox="0 0 24 24" fill="#FEF08A" style="filter:drop-shadow(0 0 12px rgba(254,240,138,.8))"><circle cx="12" cy="12" r="5.5"/></svg>`,
  evening: `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#FDBA74" stroke-width="1.6"><path d="M4 18h16" stroke-linecap="round"/><path d="M7 18a5 5 0 0 1 10 0" fill="#FDBA74"/><path stroke-linecap="round" d="M12 6v2m-6.36.64 1.42 1.42m10.58-1.42-1.42 1.42M3 14h2m14 0h2"/></svg>`,
  night: `<svg width="60" height="60" viewBox="0 0 24 24" fill="#E0E7FF" style="filter:drop-shadow(0 0 10px rgba(224,231,255,.6))"><path d="M20.35 15.35A9 9 0 0 1 8.65 3.65 9 9 0 1 0 20.35 15.35z"/></svg>`
};

function updateDashboardGreeting() {
  const hours = getWIBDate().getHours();
  let greeting = `Selamat Pagi, ${L('user.name')}`, key = 'morning', cls = 'g-morning';
  if (hours >= 11 && hours < 15) { greeting = `Selamat Siang, ${L('user.name')}`; key = 'noon'; cls = 'g-noon'; }
  else if (hours >= 15 && hours < 18) { greeting = `Selamat Sore, ${L('user.name')}`; key = 'evening'; cls = 'g-evening'; }
  else if (hours >= 18 || hours < 4) { greeting = `Selamat Malam, ${L('user.name')}`; key = 'night'; cls = 'g-night'; }

  const banner = $('dashGreetingBanner');
  if (banner) banner.className = `hero ${cls}`;
  const el = $('dashGreetingTitle'); if (el) el.textContent = greeting;
  const sm = $('sunMoonContainer'); if (sm && sm.dataset.key !== key) { sm.innerHTML = SKY_ICONS[key]; sm.dataset.key = key; }
}

function renderDashboardStats() {
  $('dashStatTasks').textContent = appState.todos.filter(t => t.status !== 'Done').length;
  $('dashStatNotes').textContent = appState.notes.length;
  let netKas = 0;
  appState.kas.forEach(k => { if (k.jenis === 'Lebih') netKas += k.jumlah; else netKas -= k.jumlah; });
  $('dashStatKas').textContent = rupiah(netKas);
  let totalFocusMinutes = 0;
  (appState.focusHistory || []).forEach(f => {
    if (f.status === 'Completed' || f.status === 'Stopped') totalFocusMinutes += Math.round(f.durationSeconds / 60);
  });
  const el = $('dashStatFocusTime'); if (el) el.textContent = totalFocusMinutes + ' mins';
}

function renderDashboardTodayAgenda() {
  const container = $('dashTodayAgendaList'); if (!container) return;
  const w = getWIBDate();
  const todayStr = wibDateStr(w);
  const dd = pad2(w.getDate()), mm = pad2(w.getMonth() + 1);
  const dateLabel = $('dashAgendaDateLabel'); if (dateLabel) dateLabel.textContent = `${dd}/${mm}/${w.getFullYear()}`;

  const todayTasks = appState.todos.filter(t => t.deadline === todayStr && t.status !== 'Done');
  const agendaStatEl = $('dashStatAgendaToday'); if (agendaStatEl) agendaStatEl.textContent = todayTasks.length;
  const pending = appState.todos.filter(t => t.status !== 'Done').length;
  const sum = $('heroSummary');
  if (sum) sum.textContent = todayTasks.length ? `${todayTasks.length} agenda hari ini · ${pending} tugas pending` : (pending ? `Tidak ada agenda hari ini · ${pending} tugas pending` : 'Semua beres! Tidak ada tugas pending 🎉');

  if (todayTasks.length === 0) {
    container.innerHTML = `<div class="empty" style="padding:22px 8px"><i class="fas fa-mug-hot"></i><div class="e-sub">Tidak ada agenda hari ini (${dd}/${mm}).</div></div>`;
    return;
  }
  todayTasks.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  container.innerHTML = todayTasks.map(t => `
    <div class="row" style="padding:10px 4px">
      <button class="check ${t.priority === 'High' ? 'high' : ''}" onclick="taToggleDone('${esc(t.id)}', this)" aria-label="Selesai"><i class="fas fa-check"></i></button>
      <div class="flex-1"><div class="t-sub truncate">${esc(t.title)}</div><div class="t-cap muted">${t.time ? 'Pukul ' + esc(t.time) : 'Sepanjang hari'}${t.status === 'On Progress' ? ' · <span class="c-orange">In Progress</span>' : ''}</div></div>
      ${t.priority === 'High' ? '<i class="fas fa-flag c-orange t-foot"></i>' : ''}
    </div>`).join('');
}

function renderDashboardUpcoming() {
  const box = $('dashUpcomingEvents'); if (!box) return;
  const today = wibDateStr();
  const items = (appState.countdowns || []).filter(c => !c.isArchived && c.tanggal >= today)
    .sort((a, b) => (a.tanggal + (a.jam || '')).localeCompare(b.tanggal + (b.jam || ''))).slice(0, 3);
  // Ada event → kartu pindah ke atas (di bawah Menu Cepat); tidak ada → kembali ke grid widget
  const card = $('dashUpcomingCard'), top = $('dashUpcomingTop'), slot = $('dashUpcomingSlot');
  if (card && top && slot) {
    if (items.length && card.parentElement !== top) { top.appendChild(card); top.classList.remove('hidden'); }
    else if (!items.length && card.parentElement === top) { slot.parentElement.insertBefore(card, slot); top.classList.add('hidden'); }
  }
  if (!items.length) { box.innerHTML = `<div class="empty" style="padding:18px 8px"><i class="fas fa-calendar-plus"></i><div class="e-sub">Belum ada event mendatang.</div></div>`; return; }
  box.innerHTML = items.map(c => {
    const rel = formatRelativeTime(c.tanggal);
    return `<div class="flex items-center gap-12" style="padding:7px 0">
      <div class="cd-days ${rel.status === 'today' ? 'bg-red' : 'bg-purple'}" style="width:52px; padding:6px 2px; border-radius:12px"><div class="n" style="font-size:18px">${rel.status === 'today' ? '!' : esc(daysUntil(c.tanggal))}</div><div class="u" style="font-size:9px">${rel.status === 'today' ? 'Hari ini' : 'hari'}</div></div>
      <div class="flex-1"><div class="t-sub semibold truncate">${esc(c.nama)}</div><div class="t-cap muted">${esc(prettyDate(c.tanggal, true))}${c.jam ? ' · ' + esc(c.jam) : ''}</div></div>
    </div>`;
  }).join('');
}
function daysUntil(dateStr) {
  const diff = Math.round((wibToEpoch(dateStr) - wibToEpoch(wibDateStr())) / 86400000);
  return diff;
}

function renderCustomWebLinks() {
  const grid = $('dashShortcutsGrid'), list = $('customWebLinksList');
  const links = appState.customWebLinks || [];
  if (grid) {
    grid.innerHTML = links.length === 0
      ? `<div class="t-foot muted" style="grid-column:1/-1; padding:10px 0">Belum ada shortcut. Tambahkan di Settings.</div>`
      : links.slice(0, 4).map(link => `
        <a href="${safeUrl(link.url)}" target="_blank" rel="noopener" class="flex items-center gap-8" style="padding:10px; border-radius:14px; background:var(--fill3); color:var(--label)">
          <span class="icon-tile" style="background:${colorFor(link.name)}; width:28px; height:28px; border-radius:8px; font-size:12px">${esc(initials(link.name).slice(0, 1))}</span>
          <span class="t-foot semibold truncate flex-1">${esc(link.name)}</span>
          <i class="fas fa-arrow-up-right-from-square t-cap2 muted"></i>
        </a>`).join('');
  }
  if (list) {
    list.innerHTML = links.length === 0
      ? `<div class="row"><span class="t-foot muted">Belum ada link kustom.</span></div>`
      : links.map((link, idx) => `
        <div class="row">
          <span class="icon-tile" style="background:${colorFor(link.name)}">${esc(initials(link.name).slice(0, 1))}</span>
          <div class="flex-1"><div class="row-title truncate">${esc(link.name)}</div><a href="${safeUrl(link.url)}" target="_blank" rel="noopener" class="row-sub truncate" style="display:block">${esc(link.url)}</a></div>
          <button onclick="deleteCustomWebLink(${idx})" class="icon-btn sm red" aria-label="Hapus"><i class="fas fa-trash"></i></button>
        </div>`).join('');
  }
}

function saveCustomWebLink(e) {
  e.preventDefault();
  const name = $('webLinkName').value.trim();
  const url = $('webLinkUrl').value.trim();
  if (!name || !url) return;
  appState.customWebLinks.push({ name, url });
  saveStateToLocal();
  renderCustomWebLinks();
  $('customWebLinkForm').reset();
  showToast('Web Link added successfully & synced!');
}

async function deleteCustomWebLink(index) {
  const link = appState.customWebLinks[index]; if (!link) return;
  if (!(await iosConfirm('Hapus shortcut?', link.name, 'Hapus', true))) return;
  appState.customWebLinks.splice(index, 1);
  saveStateToLocal();
  renderCustomWebLinks();
  showToast('Web link removed & synced.');
}

function submitQuickTask() {
  const title = $('quickTaskTitle').value.trim();
  const priority = $('quickTaskPriority').value;
  const deadline = $('quickTaskDate') ? $('quickTaskDate').value : '';
  if (!title) return showToast('Please enter task title!', false);
  appState.todos.unshift({ id: 'td_' + Date.now(), title, priority, status: '', desc: '', links: [], deadline: deadline || '', time: '' });
  saveStateToLocal();
  $('quickTaskTitle').value = '';
  if ($('quickTaskDate')) $('quickTaskDate').value = '';
  taRenderNotes(); renderDashboardStats(); renderDashboardTodayAgenda();
  showToast('Task added and synced to Firebase!');
}

function submitQuickNote() {
  const content = $('quickNoteContent').value.trim();
  if (!content) return showToast('Note details cannot be empty!', false);
  appState.notes.unshift({
    id: 'note_' + Date.now(), title: $('quickNoteTitle').value.trim() || '',
    content, tag: '', isPinned: false, date: new Date().toLocaleDateString('en-US')
  });
  saveStateToLocal();
  $('quickNoteTitle').value = ''; $('quickNoteContent').value = '';
  renderNotesList(); renderDashboardStats();
  showToast('Note saved & synced to all devices!');
}
