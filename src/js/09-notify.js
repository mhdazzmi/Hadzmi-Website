/* =========================================================
   09 · NOTIFICATIONS — reminder engine, inbox, system notifications
   ========================================================= */
const NOTIF_PREFS_KEY = 'app_notif_prefs';
const NOTIF_INBOX_KEY = 'app_notif_inbox';
const NOTIF_FIRED_KEY = 'app_notif_fired';
const DEFAULT_NOTIF_PREFS = { tasks: true, countdowns: true, focus: true, kas: false, digest: true, lead: 30 };
let swRegistration = null;
let reminderTimer = null;
let reminderDebounce = null;
let lastBannerAction = null;
let bannerTimer = null;

function getNotifPrefs() { return Object.assign({}, DEFAULT_NOTIF_PREFS, readLS(NOTIF_PREFS_KEY, {})); }
function setNotifPref(input) {
  const p = getNotifPrefs(); p[input.dataset.notif] = input.checked; writeLS(NOTIF_PREFS_KEY, p);
  showToast(`Notifikasi ${input.closest('.row').querySelector('.row-title').textContent} ${input.checked ? 'aktif' : 'nonaktif'}`);
  scheduleReminderCheck();
}
function setNotifLead(v) { const p = getNotifPrefs(); p.lead = parseInt(v) || 30; writeLS(NOTIF_PREFS_KEY, p); showToast(`Pengingat ${v} menit sebelum deadline`); scheduleReminderCheck(); }

function getInbox() { return readLS(NOTIF_INBOX_KEY, []); }
function setInbox(list) { writeLS(NOTIF_INBOX_KEY, list.slice(0, 60)); updateNotifBadge(); }
function updateNotifBadge() {
  const unread = getInbox().filter(n => !n.read).length;
  const b = $('notifBadge'); if (!b) return;
  b.textContent = unread > 9 ? '9+' : String(unread);
  b.classList.toggle('hidden', unread === 0);
  try { if (navigator.setAppBadge) unread ? navigator.setAppBadge(unread) : navigator.clearAppBadge(); } catch (e) {}
}

function notifSupported() { return 'Notification' in window; }
function updateNotifPermissionUI() {
  const lbl = $('notifPermissionLabel'), btn = $('notifPermissionBtn'); if (!lbl) return;
  if (!notifSupported()) {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    lbl.textContent = ios ? 'iPhone: Add to Home Screen dulu (Share → Tambah ke Layar Utama)' : 'Browser tidak mendukung — notifikasi in-app tetap aktif';
    btn.classList.add('hidden'); return;
  }
  const p = Notification.permission;
  lbl.textContent = p === 'granted' ? 'Diizinkan ✓' : p === 'denied' ? 'Diblokir — ubah di pengaturan browser' : 'Belum diizinkan';
  btn.classList.toggle('hidden', p !== 'default');
}
function requestNotifPermission() {
  if (!notifSupported()) return showToast('Browser ini tidak mendukung notifikasi sistem.', false);
  Notification.requestPermission().then(p => {
    updateNotifPermissionUI();
    if (p === 'granted') { showToast('Notifikasi diizinkan!'); sendTestNotification(); }
    else showToast('Izin notifikasi tidak diberikan.', false);
  });
}

function showSystemNotification(title, body, tag) {
  if (!notifSupported() || Notification.permission !== 'granted') return;
  const opts = { body, tag: tag || undefined, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', renotify: false };
  if (swRegistration && swRegistration.showNotification) { swRegistration.showNotification(title, opts).catch(() => {}); return; }
  try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); n.close(); }; } catch (e) {}
}

function showNotifBanner(n) {
  const el = $('notifBanner'); if (!el) return;
  $('nbTitle').textContent = n.title; $('nbBody').textContent = n.body || '';
  $('nbIcon').className = 'b-icon ' + (n.color || 'bg-red');
  $('nbIcon').innerHTML = `<i class="fas ${n.icon || 'fa-bell'}"></i>`;
  lastBannerAction = n.action || null;
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), 6000);
}
function onNotifBannerClick() {
  $('notifBanner').classList.remove('show');
  if (lastBannerAction) runNotifAction(lastBannerAction); else openNotificationCenter();
}
function runNotifAction(a) {
  if (!a) return;
  closeSheet('sheetNotif');
  if (a.tab) navigateFromQuickMenu(a.tab, a.sub || null);
  if (a.filter && typeof taSetFilter === 'function') taSetFilter(a.filter);
}

/** Tambah notifikasi: in-app inbox + banner + notifikasi sistem (jika diizinkan). key mencegah duplikat. */
function pushNotification(n) {
  const prefs = getNotifPrefs();
  if (n.pref && prefs[n.pref] === false) return false;
  if (n.key) {
    const fired = readLS(NOTIF_FIRED_KEY, {});
    if (fired[n.key]) return false;
    fired[n.key] = Date.now();
    writeLS(NOTIF_FIRED_KEY, fired);
  }
  const item = { id: 'n_' + Date.now() + Math.random().toString(36).slice(2, 6), title: n.title, body: n.body || '', icon: n.icon || 'fa-bell', color: n.color || 'bg-red', ts: Date.now(), read: false, action: n.action || null };
  setInbox([item, ...getInbox()]);
  showNotifBanner(item);
  if (n.system !== false) showSystemNotification(n.title, n.body, n.key);
  haptic(20);
  return true;
}

function openNotificationCenter() {
  renderNotifInbox();
  openSheet('sheetNotif');
  setTimeout(() => setInbox(getInbox().map(n => Object.assign(n, { read: true }))), 800);
}
function renderNotifInbox() {
  const box = $('notifInboxList'); if (!box) return;
  const list = getInbox();
  if (!list.length) { box.innerHTML = `<div class="empty"><i class="far fa-bell-slash"></i><div class="e-title">Tidak ada notifikasi</div><div class="e-sub">Pengingat deadline, event, dan timer akan muncul di sini.</div></div>`; return; }
  box.innerHTML = list.map((n, i) => `
    <div class="notif-item ${n.read ? '' : 'unread'}" data-i="${i}" style="cursor:${n.action ? 'pointer' : 'default'}">
      <div class="ni-icon ${esc(n.color)}"><i class="fas ${esc(n.icon)}"></i></div>
      <div class="flex-1"><div class="flex justify-between gap-8"><div class="ni-title">${esc(n.title)}</div><div class="ni-time">${esc(timeAgo(n.ts))}</div></div><div class="ni-body">${esc(n.body)}</div></div>
    </div>`).join('');
  box.querySelectorAll('.notif-item').forEach(el => el.onclick = () => { const n = list[+el.dataset.i]; if (n && n.action) runNotifAction(n.action); });
}
async function clearNotifInbox() {
  if (!getInbox().length) return;
  if (!(await iosConfirm('Hapus semua notifikasi?', '', 'Hapus', true))) return;
  setInbox([]); renderNotifInbox();
}
function sendTestNotification() {
  pushNotification({ title: 'Notifikasi Tes ✅', body: 'Notifikasi Hadzmi Hub berfungsi dengan baik.', icon: 'fa-paper-plane', color: 'bg-green' });
}

// ---------- Reminder engine ----------
// Satu sumber kebenaran: daftar event pengingat dengan waktu mulai (at) & batas (until).
// Dipakai untuk notifikasi in-app (saat website terbuka) DAN dikirim ke server untuk Web Push (saat tertutup).
function scheduleReminderCheck() {
  clearTimeout(reminderDebounce);
  reminderDebounce = setTimeout(checkReminders, 1500);
}
function addDaysToDateStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function endOfWibDay(dateStr) { return wibToEpoch(dateStr, '23:59') + 60000; }

function buildReminderEvents(now, horizonDays) {
  now = now || Date.now();
  const horizon = now + (horizonDays || 35) * 86400000;
  const prefs = getNotifPrefs();
  const lead = (prefs.lead || 30) * 60000;
  const today = wibDateStr();
  const out = [];
  const add = (e) => { if (e.until > now && e.at < horizon) out.push(e); };
  const todoAction = (filter) => ({ tab: 'tab-hub', sub: 'sub-todo', filter });

  if (prefs.tasks) {
    appState.todos.forEach(t => {
      if (t.status === 'Done' || !t.deadline) return;
      const sig = `${t.id}_${t.deadline}_${t.time || ''}`;
      if (t.time) {
        const due = wibToEpoch(t.deadline, t.time);
        add({ key: 'task_lead_' + sig, at: due - lead, until: due, title: '⏰ Deadline sebentar lagi', body: `${t.title} · pukul ${t.time} WIB`, icon: 'fa-list-check', color: 'bg-blue', pref: 'tasks', action: todoAction('today') });
        add({ key: 'task_due_' + sig, at: due, until: due + 2 * 3600000, title: '🔔 Waktunya sekarang', body: t.title, icon: 'fa-bell', color: 'bg-red', pref: 'tasks', action: todoAction('today') });
      } else {
        add({ key: 'task_today_' + sig, at: wibToEpoch(t.deadline, '07:00'), until: endOfWibDay(t.deadline), title: '📅 Deadline hari ini', body: t.title, icon: 'fa-calendar-day', color: 'bg-indigo', pref: 'tasks', action: todoAction('today') });
      }
      const prev = addDaysToDateStr(t.deadline, -1);
      add({ key: 'task_h1_' + sig, at: wibToEpoch(prev, '19:00'), until: endOfWibDay(prev), title: 'Deadline besok', body: `${t.title}${t.time ? ' · ' + t.time : ''}`, icon: 'fa-calendar', color: 'bg-orange', pref: 'tasks', action: todoAction('active') });
    });
  }

  if (prefs.countdowns) {
    appState.countdowns.forEach(c => {
      if (c.isArchived || !c.tanggal) return;
      const sig = `${c.id}_${c.tanggal}`;
      const action = { tab: 'tab-hub', sub: 'sub-countdown' };
      [3, 1].forEach(n => {
        const d = addDaysToDateStr(c.tanggal, -n);
        add({ key: `cd_h${n}_${sig}`, at: wibToEpoch(d, '08:00'), until: endOfWibDay(d), title: n === 1 ? '⏳ Besok!' : '⏳ 3 hari lagi', body: `${c.nama} · ${prettyDate(c.tanggal, true)}`, icon: 'fa-hourglass-half', color: 'bg-purple', pref: 'countdowns', action });
      });
      add({ key: `cd_today_${sig}`, at: wibToEpoch(c.tanggal, '07:00'), until: endOfWibDay(c.tanggal), title: '🎉 Hari ini!', body: `${c.nama}${c.jam ? ' · pukul ' + c.jam : ''}`, icon: 'fa-champagne-glasses', color: 'bg-pink', pref: 'countdowns', action });
      if (c.jam) {
        const due = wibToEpoch(c.tanggal, c.jam);
        add({ key: `cd_lead_${sig}_${c.jam}`, at: due - lead, until: due, title: '⏰ Event segera dimulai', body: `${c.nama} · pukul ${c.jam}`, icon: 'fa-hourglass-end', color: 'bg-purple', pref: 'countdowns', action });
      }
    });
  }

  if (prefs.kas && !appState.kas.some(k => k.tanggal === today)) {
    add({ key: 'kas_' + today, at: wibToEpoch(today, '20:00'), until: endOfWibDay(today), title: '💰 Catat kas hari ini', body: 'Belum ada entri Cash Ledger untuk hari ini.', icon: 'fa-wallet', color: 'bg-mint', pref: 'kas', action: { tab: 'tab-workfin', sub: 'sub-kas' } });
  }

  if (prefs.digest) {
    const days = new Set();
    appState.todos.forEach(t => { if (t.deadline && t.status !== 'Done' && t.deadline >= today) days.add(t.deadline); });
    appState.countdowns.forEach(c => { if (!c.isArchived && c.tanggal >= today) days.add(c.tanggal); });
    days.forEach(d => {
      const agenda = appState.todos.filter(t => t.deadline === d && t.status !== 'Done').length;
      const events = appState.countdowns.filter(c => !c.isArchived && c.tanggal === d).length;
      add({ key: 'digest_' + d, at: wibToEpoch(d, '07:00'), until: wibToEpoch(d, '12:00'), title: '☀️ Ringkasan pagi', body: `Hari ini: ${agenda} agenda${events ? ` & ${events} event` : ''}. Semangat, ${L('user.name')}!`, icon: 'fa-sun', color: 'bg-orange', pref: 'digest', action: todoAction('today') });
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

function checkReminders() {
  if (!appStarted) return;
  const now = Date.now();
  buildReminderEvents(now).forEach(e => { if (e.at <= now && now < e.until) pushNotification(e); });

  // Ringkasan tugas terlambat (hanya in-app)
  const prefs = getNotifPrefs();
  const today = wibDateStr();
  if (prefs.tasks && getWIBDate().getHours() >= 8) {
    const overdueCount = appState.todos.filter(t => t.status !== 'Done' && t.deadline && now > taDueEpoch(t) + (t.time ? 2 * 3600000 : 0)).length;
    if (overdueCount > 0) pushNotification({ key: 'task_overdue_' + today, title: '⚠️ Tugas terlambat', body: `Kamu punya ${overdueCount} tugas yang melewati deadline.`, icon: 'fa-triangle-exclamation', color: 'bg-red', pref: 'tasks', action: { tab: 'tab-hub', sub: 'sub-todo', filter: 'overdue' } });
  }

  // Bersihkan kunci lama (> 14 hari)
  const fired = readLS(NOTIF_FIRED_KEY, {});
  const cutoff = now - 14 * 86400000; let changed = false;
  Object.keys(fired).forEach(k => { if (fired[k] < cutoff) { delete fired[k]; changed = true; } });
  if (changed) writeLS(NOTIF_FIRED_KEY, fired);

  if (typeof syncPushSchedule === 'function') syncPushSchedule(false);
  if (typeof applyPhotoRetention === 'function') applyPhotoRetention();
}

function initNotifications() {
  updateNotifBadge();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !/blogspot\.|blogger\./i.test(location.hostname)) {
    navigator.serviceWorker.register('sw.js').then(reg => { swRegistration = reg; if (typeof initPush === 'function') initPush(); }).catch(() => {});
    navigator.serviceWorker.addEventListener('message', ev => {
      const d = ev.data || {};
      if (d.type === 'hz-navigate') runNotifAction(d.action);
      if (d.type === 'hz-push' && typeof mergeServerNotifications === 'function') mergeServerNotifications(d.items || [], true);
    });
  }
  checkReminders();
  reminderTimer = setInterval(checkReminders, 30000);
}
