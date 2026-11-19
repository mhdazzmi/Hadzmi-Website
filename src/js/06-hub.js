/* =========================================================
   06 · HUB — Mind Dump (Notes), Bookmarks, Countdown
   ========================================================= */

// ---------------- MIND DUMP & CATATAN KERJA ----------------
// coll: 'notes' (Mind Dump) atau 'workNotes' (Catatan Kerja) — struktur data sama.
let noteColl = 'notes';
function noteList(coll) { return appState[coll || 'notes'] || (appState[coll] = []); }
function noteArg(coll) { return coll && coll !== 'notes' ? `, '${coll}'` : ''; }
function rerenderNotes(coll) { if (coll === 'workNotes') renderWorkNotes(); else renderNotesList(); renderDashboardStats(); }

function openNoteSheet(id, coll) {
  noteColl = coll || 'notes';
  const note = id ? noteList(noteColl).find(n => n.id === id) : null;
  $('noteEditId').value = note ? note.id : '';
  $('noteTitle').value = note ? (note.title || '') : '';
  $('noteContent').value = note ? note.content : '';
  $('noteTag').value = note ? (note.tag || '') : '';
  const kind = noteColl === 'workNotes' ? 'Catatan Kerja' : 'Catatan';
  $('noteSheetTitle').textContent = note ? `Edit ${kind}` : `${kind} Baru`;
  closeSheet('sheetNoteView');
  openSheet('sheetNote');
  setTimeout(() => $(note ? 'noteContent' : 'noteTitle').focus(), 350);
}
function saveNoteRecord() {
  const content = $('noteContent').value.trim();
  if (!content) return showToast('Content required!', false);
  const list = noteList(noteColl);
  const editId = $('noteEditId').value;
  const title = $('noteTitle').value.trim() || '', tag = $('noteTag').value.trim();
  if (editId && list.some(n => n.id === editId)) {
    const n = list.find(x => x.id === editId);
    n.title = title; n.content = content; n.tag = tag;
    showToast('Note updated & synced!');
  } else {
    list.unshift({ id: 'note_' + Date.now(), title, content, tag, isPinned: false, date: new Date().toLocaleDateString('en-US') });
    showToast('Note saved & synced!');
  }
  saveStateToLocal();
  $('noteEditId').value = ''; $('noteTitle').value = ''; $('noteContent').value = ''; $('noteTag').value = '';
  rerenderNotes(noteColl);
  closeSheet('sheetNote');
}
function copyNoteText(id, coll) {
  const note = noteList(coll).find(n => n.id === id);
  if (note) { copyText((note.title ? note.title + '\n\n' : '') + note.content); showToast('Note copied to clipboard!'); }
}
function editNoteRecord(id, coll) { openNoteSheet(id, coll); }
function togglePinNote(id, coll) {
  const note = noteList(coll).find(n => n.id === id);
  if (note) { note.isPinned = !note.isPinned; saveStateToLocal(); rerenderNotes(coll); showToast(note.isPinned ? 'Note pinned!' : 'Note unpinned.'); if ($('sheetNoteView').classList.contains('open')) viewNote(id, coll); }
}
function renderNoteCards(coll, container, search, emptyIcon) {
  const filtered = noteList(coll).filter(n => ((n.title || '') + ' ' + n.content + ' ' + (n.tag || '')).toLowerCase().includes(search));
  filtered.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
  if (filtered.length === 0) {
    container.innerHTML = `<div class="card" style="grid-column:1/-1"><div class="empty"><i class="fas ${emptyIcon}"></i><div class="e-title">Belum ada catatan</div><div class="e-sub">Tap <i class="fas fa-pen-to-square"></i> untuk menulis.</div></div></div>`;
    return;
  }
  const c = noteArg(coll);
  container.innerHTML = filtered.map(note => {
    const isLong = note.content.length > 180; const id = esc(note.id);
    return `
      <div class="note-card ${note.isPinned ? 'pinned' : ''}" onclick="viewNote('${id}'${c})">
        <div class="flex justify-between items-center gap-8">
          <div class="flex items-center gap-6">${note.isPinned ? '<i class="fas fa-thumbtack" style="color:#E0A800"></i>' : ''}${note.tag ? `<span class="badge ${coll === 'workNotes' ? 'tint-blue' : 'tint-yellow'}">${esc(note.tag)}</span>` : ''}</div>
          <span class="t-cap muted">${esc(note.date || '')}</span>
        </div>
        ${note.title ? `<div class="n-title">${esc(note.title)}</div>` : ''}
        <div class="n-body">${esc(isLong ? note.content.slice(0, 180) + '…' : note.content)}</div>
        <div class="n-foot" onclick="event.stopPropagation()">
          <button onclick="togglePinNote('${id}'${c})" class="icon-btn sm ${note.isPinned ? '' : 'clear'}" style="${note.isPinned ? 'color:#C08A00; background:rgba(255,204,0,.2)' : 'color:var(--label2)'}" title="Pin"><i class="fas fa-thumbtack"></i></button>
          <div class="flex gap-4">
            <button onclick="copyNoteText('${id}'${c})" class="icon-btn sm clear" style="color:var(--label2)" title="Salin"><i class="far fa-copy"></i></button>
            <button onclick="shareNote('${id}'${c})" class="icon-btn sm clear" style="color:var(--label2)" title="Gmail"><i class="far fa-envelope"></i></button>
            <button onclick="editNoteRecord('${id}'${c})" class="icon-btn sm clear" style="color:var(--label2)" title="Edit"><i class="fas fa-pen"></i></button>
            <button onclick="deleteNoteRecord('${id}'${c})" class="icon-btn sm clear" style="color:var(--red)" title="Hapus"><i class="far fa-trash-can"></i></button>
          </div>
        </div>
      </div>`;
  }).join('');
}
function renderNotesList() {
  const container = $('notesGridContainer'); if (!container) return;
  $('noteCountBadge').textContent = 'Total: ' + appState.notes.length;
  renderNoteCards('notes', container, ($('searchNoteInput').value || '').toLowerCase(), 'fa-note-sticky');
}
function renderWorkNotes() {
  const container = $('workNotesGrid'); if (!container) return;
  $('workNoteCountBadge').textContent = 'Total: ' + noteList('workNotes').length;
  renderNoteCards('workNotes', container, ($('searchWorkNoteInput').value || '').toLowerCase(), 'fa-clipboard');
}
function viewNote(id, coll) {
  const note = noteList(coll).find(n => n.id === id); if (!note) return;
  const c = noteArg(coll), sid = esc(note.id);
  $('noteViewBody').innerHTML = `
    <div class="flex items-center gap-8 wrap" style="margin-bottom:10px">${note.isPinned ? '<span class="badge tint-yellow"><i class="fas fa-thumbtack"></i> Pinned</span>' : ''}${note.tag ? `<span class="badge tint-yellow">${esc(note.tag)}</span>` : ''}<span class="t-cap muted">${esc(note.date || '')}</span></div>
    ${note.title ? `<h2 class="t-title2" style="margin-bottom:10px">${esc(note.title)}</h2>` : ''}
    <div class="t-callout pre" style="line-height:1.55">${esc(note.content)}</div>
    <div class="grid-2 mt-28">
      <button class="btn btn-gray btn-sm" onclick="editNoteRecord('${sid}'${c})"><i class="fas fa-pen"></i> Edit</button>
      <button class="btn btn-tinted btn-sm" onclick="shareNote('${sid}'${c})"><i class="fas fa-envelope"></i> Gmail</button>
    </div>`;
  $('noteViewMore').onclick = () => openActionSheet({
    title: note.title || 'Catatan', actions: [
      { text: note.isPinned ? 'Lepas Pin' : 'Pin Catatan', icon: 'fas fa-thumbtack', onClick: () => togglePinNote(id, coll) },
      { text: 'Salin Teks', icon: 'far fa-copy', onClick: () => copyNoteText(id, coll) },
      { text: 'Hapus', icon: 'far fa-trash-can', destructive: true, onClick: () => deleteNoteRecord(id, coll) }
    ]
  });
  openSheet('sheetNoteView');
}
async function deleteNoteRecord(id, coll) {
  const list = noteList(coll);
  const note = list.find(n => n.id === id); if (!note) return;
  if (!(await iosConfirm('Hapus catatan?', note.title || note.content.slice(0, 60), 'Hapus', true))) return;
  appState[coll || 'notes'] = list.filter(n => n.id !== id);
  saveStateToLocal(); rerenderNotes(coll);
  closeSheet('sheetNoteView');
  showToast('Note deleted.');
}

// ---------------- BOOKMARKS ----------------
function bookmarkUrlRowHTML(val, required) {
  return `<div class="inline-input-row"><input type="url" value="${esc(val)}" placeholder="https://…" class="bookmark-url-input field" style="padding:10px 12px" ${required ? 'required' : ''}><button type="button" onclick="this.parentElement.remove()" class="icon-btn sm red"><i class="fas fa-minus"></i></button></div>`;
}
function addBookmarkUrlInput(val = '') { $('bookmarkUrlContainer').insertAdjacentHTML('beforeend', bookmarkUrlRowHTML(val, false)); }
function openBookmarkSheet() { resetBookmarkForm(); openSheet('sheetBookmark'); setTimeout(() => $('linkTitle').focus(), 350); }
function saveLinkRecord(e) {
  e.preventDefault();
  const title = $('linkTitle').value.trim(), category = $('linkCategory').value.trim(), editId = $('linkEditId').value;
  const urls = Array.from(document.querySelectorAll('.bookmark-url-input')).map(el => el.value.trim()).filter(v => v !== '');
  if (!title || urls.length === 0) return showToast('Title and at least 1 URL required!', false);
  if (editId) {
    const item = appState.links.find(l => l.id === editId);
    if (item) { item.title = title; item.urls = urls; item.url = urls[0]; item.category = category; }
    showToast('Bookmark updated & synced!');
  } else {
    appState.links.unshift({ id: 'link_' + Date.now(), title, urls, url: urls[0], category });
    showToast('Bookmark saved & synced!');
  }
  saveStateToLocal(); resetBookmarkForm(); renderLinksList();
  closeSheet('sheetBookmark');
}
function editLinkRecord(id) {
  const item = appState.links.find(l => l.id === id); if (!item) return;
  $('linkEditId').value = item.id; $('linkTitle').value = item.title; $('linkCategory').value = item.category || '';
  const c = $('bookmarkUrlContainer'); c.innerHTML = '';
  (item.urls || [item.url]).forEach((u, i) => c.insertAdjacentHTML('beforeend', bookmarkUrlRowHTML(u, i === 0)));
  $('linkFormTitle').textContent = 'Edit Bookmark';
  $('linkSubmitBtn').textContent = 'Update';
  openSheet('sheetBookmark');
}
function resetBookmarkForm() {
  $('linkEditId').value = ''; $('linkTitle').value = ''; $('linkCategory').value = '';
  $('bookmarkUrlContainer').innerHTML = bookmarkUrlRowHTML('', true);
  $('linkFormTitle').textContent = 'Bookmark Baru';
  $('linkSubmitBtn').textContent = 'Simpan';
}
function hostOf(u) { try { return new URL(/^https?:/i.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch (e) { return u; } }
function renderLinksList() {
  const container = $('linksGridContainer'); if (!container) return;
  const search = ($('searchLinkInput').value || '').toLowerCase();
  const filtered = appState.links.filter(l => (l.title + ' ' + (l.urls ? l.urls.join(' ') : l.url) + ' ' + (l.category || '')).toLowerCase().includes(search));
  if (filtered.length === 0) {
    container.innerHTML = `<div class="card" style="grid-column:1/-1"><div class="empty"><i class="fas fa-bookmark"></i><div class="e-title">Belum ada bookmark</div><div class="e-sub">Simpan link penting dengan tombol + Baru.</div></div></div>`;
    return;
  }
  container.innerHTML = filtered.map(link => {
    const urlList = link.urls || [link.url];
    const h = hostOf(urlList[0] || '');
    return `
      <div class="card card-pad">
        <div class="flex items-center gap-10" style="margin-bottom:10px">
          <span class="icon-tile lg" style="background:${colorFor(h)}; overflow:hidden"><img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=64" alt="" style="width:24px !important;height:24px !important" onerror="this.replaceWith(document.createTextNode('${esc(initials(link.title).slice(0, 1))}'))"></span>
          <div class="flex-1"><div class="t-headline truncate">${esc(link.title)}</div>${link.category ? `<span class="badge tint-indigo" style="margin-top:3px">${esc(link.category)}</span>` : `<div class="t-cap muted">${esc(h)}</div>`}</div>
          <button onclick="openBookmarkActions('${esc(link.id)}')" class="icon-btn sm"><i class="fas fa-ellipsis"></i></button>
        </div>
        ${urlList.map(u => `<a href="${safeUrl(u)}" target="_blank" rel="noopener" class="link-chip" title="${esc(u)}"><i class="fas fa-link" style="font-size:12px"></i><span class="truncate">${esc(String(u).replace(/^https?:\/\//, ''))}</span><i class="fas fa-arrow-up-right-from-square" style="margin-left:auto; font-size:11px"></i></a>`).join('')}
      </div>`;
  }).join('');
}
function openBookmarkActions(id) {
  const link = appState.links.find(l => l.id === id); if (!link) return;
  openActionSheet({ title: link.title, actions: [
    { text: 'Edit', icon: 'fas fa-pen', onClick: () => editLinkRecord(id) },
    { text: 'Salin Link', icon: 'far fa-copy', onClick: () => { copyText((link.urls || [link.url]).join('\n')); showToast('Link disalin!'); } },
    { text: 'Kirim ke Gmail', icon: 'fas fa-envelope', onClick: () => shareBookmark(id) },
    { text: 'Hapus', icon: 'far fa-trash-can', destructive: true, onClick: () => deleteLinkRecord(id) }
  ] });
}
async function deleteLinkRecord(id) {
  const link = appState.links.find(l => l.id === id); if (!link) return;
  if (!(await iosConfirm('Hapus bookmark?', link.title, 'Hapus', true))) return;
  appState.links = appState.links.filter(l => l.id !== id);
  saveStateToLocal(); renderLinksList(); showToast('Bookmark deleted.');
}

// ---------------- COUNTDOWN ----------------
let countdownEditMode = false;
let cdTabActiveFilter = 'aktif';
let expandedCountdownIds = {};

function cdDiffDays(targetDateStr) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(targetDateStr); target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
function formatRelativeTime(targetDateStr) {
  const diffDays = cdDiffDays(targetDateStr);
  if (diffDays === 0) return { text: "Today!", status: "today", isPast: false };
  const isPast = diffDays < 0; const absDays = Math.abs(diffDays);
  let text = "";
  if (absDays >= 30) {
    const months = Math.floor(absDays / 30); const remDays = absDays % 30;
    const monthLabel = months === 1 ? "1 Month" : `${months} Months`;
    const dayLabel = remDays > 0 ? (remDays === 1 ? "1 Day" : `${remDays} Days`) : "";
    text = dayLabel ? `${monthLabel} ${dayLabel}` : monthLabel;
  } else { text = absDays === 1 ? "1 Day" : `${absDays} Days`; }
  return { text: isPast ? `${text} ago` : `${text} Left`, isPast };
}
function openCountdownSheet() { resetCdForm(); openSheet('sheetCountdown'); setTimeout(() => $('cd-input-nama').focus(), 350); }
function simpanCountDown() {
  const nama = $('cd-input-nama').value.trim(), tgl = $('cd-input-tanggal').value;
  if (!nama || !tgl) return showToast('Event name & date are required!', false);
  const editId = $('cd-edit-id').value;
  const fields = { nama, kategori: $('cd-input-kategori').value || '', catatan: $('cd-input-catatan').value, tanggal: tgl, jam: $('cd-input-jam').value };
  if (editId) {
    const item = appState.countdowns.find(c => c.id === editId);
    if (item) Object.assign(item, fields);
    showToast('Countdown updated & synced!');
  } else {
    appState.countdowns.unshift(Object.assign({ id: 'cd_' + Date.now() }, fields, { isArchived: false }));
    showToast('Event countdown added & synced!');
  }
  saveStateToLocal(); resetCdForm(); renderCountDownLog(); renderDashboardUpcoming();
  closeSheet('sheetCountdown');
}
function resetCdForm() {
  ['cd-edit-id', 'cd-input-nama', 'cd-input-catatan', 'cd-input-tanggal', 'cd-input-jam', 'cd-input-kategori'].forEach(id => $(id).value = '');
  $('cd-form-title').textContent = 'Event Baru';
  $('cd-submit-btn').textContent = 'Tambah';
}
function editCountDown(id) {
  const item = appState.countdowns.find(c => c.id === id); if (!item) return;
  $('cd-edit-id').value = item.id; $('cd-input-nama').value = item.nama; $('cd-input-kategori').value = item.kategori || '';
  $('cd-input-catatan').value = item.catatan || ''; $('cd-input-tanggal').value = item.tanggal; $('cd-input-jam').value = item.jam || '';
  $('cd-form-title').textContent = 'Edit Event';
  $('cd-submit-btn').textContent = 'Simpan';
  openSheet('sheetCountdown');
}
const CD_CAT_COLORS = { Personal: '#FF2D55', Work: '#007AFF', Education: '#FF9500' };
function renderCountDownLog() {
  const container = $('cd-list-container'); if (!container) return;
  const filtered = appState.countdowns.filter(c => cdTabActiveFilter === 'arsip' ? c.isArchived : !c.isArchived);
  if (filtered.length === 0) {
    container.innerHTML = `<div class="card" style="grid-column:1/-1"><div class="empty"><i class="fas fa-hourglass-half"></i><div class="e-title">${cdTabActiveFilter === 'arsip' ? 'Arsip kosong' : 'Belum ada event'}</div><div class="e-sub">Hitung mundur ke momen penting dengan tombol + Event.</div></div></div>`;
    return;
  }
  container.innerHTML = filtered.map(item => {
    const rel = formatRelativeTime(item.tanggal);
    const diff = cdDiffDays(item.tanggal);
    const hasNote = item.catatan && item.catatan.trim() !== '';
    const isExpanded = !!expandedCountdownIds[item.id];
    const bg = rel.status === 'today' ? 'var(--red)' : rel.isPast ? 'var(--gray)' : diff <= 7 ? 'var(--orange)' : (CD_CAT_COLORS[item.kategori] || 'var(--purple)');
    const id = esc(item.id);
    return `
      <div class="cd-card ${hasNote ? 'tappable' : ''}" onclick="${hasNote ? `toggleCountDownDesc('${id}')` : ''}" style="${hasNote ? 'cursor:pointer' : ''}; flex-direction:column">
        <div class="flex gap-12">
          <div class="cd-days" style="background:${bg}"><div class="n">${rel.status === 'today' ? '🎉' : Math.abs(diff)}</div><div class="u">${rel.status === 'today' ? 'Hari ini' : rel.isPast ? 'hari lalu' : 'hari lagi'}</div></div>
          <div class="flex-1">
            <div class="flex items-center gap-6 wrap">
              ${item.kategori ? `<span class="badge" style="background:${CD_CAT_COLORS[item.kategori] || 'var(--gray)'}22; color:${CD_CAT_COLORS[item.kategori] || 'var(--label2)'}">${esc(item.kategori)}</span>` : ''}
              <span class="badge ${rel.isPast ? 'tint-gray' : 'tint-blue'}">${esc(rel.text)}</span>
            </div>
            <div class="t-headline" style="margin-top:6px">${esc(item.nama)}</div>
            <div class="t-foot muted mt-4"><i class="far fa-calendar"></i> ${esc(prettyDate(item.tanggal, true))}${item.jam ? ' · ' + esc(item.jam) : ''}</div>
            ${hasNote ? `<div class="t-cap c-blue semibold mt-4"><i class="fas fa-align-left"></i> Catatan <i class="fas fa-chevron-${isExpanded ? 'up' : 'down'}"></i></div>` : ''}
          </div>
          <div class="col gap-6" onclick="event.stopPropagation()">
            <button onclick="editCountDown('${id}')" class="icon-btn sm blue" title="Edit"><i class="fas fa-pen"></i></button>
            <button onclick="toggleArchiveCountDown('${id}')" class="icon-btn sm" title="${item.isArchived ? 'Pulihkan' : 'Arsipkan'}"><i class="fas ${item.isArchived ? 'fa-box-open' : 'fa-box-archive'}"></i></button>
            <button onclick="shareCountdown('${id}')" class="icon-btn sm" title="Gmail"><i class="far fa-envelope"></i></button>
            ${countdownEditMode ? `<button onclick="deleteCountDown('${id}')" class="icon-btn sm red" title="Hapus"><i class="fas fa-trash"></i></button>` : ''}
          </div>
        </div>
        ${hasNote && isExpanded ? `<div class="cd-note"><span class="t-cap2 bold c-blue" style="display:block; margin-bottom:4px; letter-spacing:.04em">DESKRIPSI / CATATAN</span>${esc(item.catatan)}</div>` : ''}
      </div>`;
  }).join('');
}
function toggleCountDownDesc(id) { expandedCountdownIds[id] = !expandedCountdownIds[id]; renderCountDownLog(); }
function toggleCountDownEditMode() {
  countdownEditMode = !countdownEditMode;
  const b = $('cdEditModeBtn'); if (b) { b.textContent = countdownEditMode ? 'Selesai' : 'Edit'; b.className = countdownEditMode ? 'btn btn-red btn-sm' : 'btn btn-gray btn-sm'; }
  showToast(countdownEditMode ? 'Edit mode active.' : 'Edit mode disabled.');
  renderCountDownLog();
}
function toggleArchiveCountDown(id) {
  const item = appState.countdowns.find(c => c.id === id);
  if (item) { item.isArchived = !item.isArchived; saveStateToLocal(); renderCountDownLog(); renderDashboardUpcoming(); showToast(item.isArchived ? 'Archived & synced.' : 'Restored & synced.'); }
}
async function deleteCountDown(id) {
  const item = appState.countdowns.find(c => c.id === id); if (!item) return;
  if (!(await iosConfirm('Hapus event?', item.nama, 'Hapus', true))) return;
  appState.countdowns = appState.countdowns.filter(c => c.id !== id);
  saveStateToLocal(); renderCountDownLog(); renderDashboardUpcoming(); showToast('Deleted & synced.');
}
function gantiCountDownTab(tab) {
  cdTabActiveFilter = tab;
  $('cd-tab-aktif').classList.toggle('active', tab === 'aktif');
  $('cd-tab-arsip').classList.toggle('active', tab === 'arsip');
  renderCountDownLog();
}
