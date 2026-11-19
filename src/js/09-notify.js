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
function setNotifLead(v) { const p = getNotifPrefs(); p.lead = parseInt(v) || 30; writeLS(NOTIF_PREFS_KEY, p); showToast(`Pengingat ${v} menit sebelum deadline`); }

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
  const opts = { body, tag: tag || undefined, icon: 'https://placehold.co/192x192/007AFF/FFFFFF?text=H', badge: 'https://placehold.co/96x96/007AFF/FFFFFF?text=H', renotify: false };
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
function scheduleReminderCheck() {
  clearTimeout(reminderDebounce);
  reminderDebounce = setTimeout(checkReminders, 1500);
}
function checkReminders() {
  if (!appStarted) return;
  const prefs = getNotifPrefs();
  const now = Date.now();
  const lead = (prefs.lead || 30) * 60000;
  const today = wibDateStr(), tomorrow = wibAddDays(1);
  const hour = getWIBDate().getHours();
  const todoAction = (filter) => ({ tab: 'tab-hub', sub: 'sub-todo', filter });

  if (prefs.tasks) {
    let overdueCount = 0;
    appState.todos.forEach(t => {
      if (t.status === 'Done' || !t.deadline) return;
      const due = taDueEpoch(t);
      const sig = `${t.id}_${t.deadline}_${t.time || ''}`;
      if (t.time) {
        if (now >= due - lead && now < due) pushNotification({ key: 'task_lead_' + sig, title: '⏰ Deadline sebentar lagi', body: `${t.title} · pukul ${t.time} WIB`, icon: 'fa-list-check', color: 'bg-blue', pref: 'tasks', action: todoAction('today') });
        else if (now >= due && now < due + 2 * 3600000) pushNotification({ key: 'task_due_' + sig, title: '🔔 Waktunya sekarang', body: t.title, icon: 'fa-bell', color: 'bg-red', pref: 'tasks', action: todoAction('today') });
      } else if (t.deadline === today && hour >= 7) {
        pushNotification({ key: 'task_today_' + sig, title: '📅 Deadline hari ini', body: t.title, icon: 'fa-calendar-day', color: 'bg-indigo', pref: 'tasks', action: todoAction('today') });
      }
      if (t.deadline === tomorrow && hour >= 19) pushNotification({ key: 'task_h1_' + sig, title: 'Deadline besok', body: `${t.title}${t.time ? ' · ' + t.time : ''}`, icon: 'fa-calendar', color: 'bg-orange', pref: 'tasks', action: todoAction('active') });
      if (now > due + (t.time ? 2 * 3600000 : 0)) overdueCount++;
    });
    if (overdueCount > 0 && hour >= 8) pushNotification({ key: 'task_overdue_' + today, title: '⚠️ Tugas terlambat', body: `Kamu punya ${overdueCount} tugas yang melewati deadline.`, icon: 'fa-triangle-exclamation', color: 'bg-red', pref: 'tasks', action: todoAction('overdue') });
  }

  if (prefs.countdowns) {
    appState.countdowns.forEach(c => {
      if (c.isArchived || !c.tanggal) return;
      const days = daysUntil(c.tanggal);
      const sig = `${c.id}_${c.tanggal}`;
      const action = { tab: 'tab-hub', sub: 'sub-countdown' };
      if ((days === 3 || days === 1) && hour >= 8) pushNotification({ key: `cd_h${days}_${sig}`, title: days === 1 ? '⏳ Besok!' : '⏳ 3 hari lagi', body: `${c.nama} · ${prettyDate(c.tanggal, true)}`, icon: 'fa-hourglass-half', color: 'bg-purple', pref: 'countdowns', action });
      if (days === 0 && hour >= 7) pushNotification({ key: `cd_today_${sig}`, title: '🎉 Hari ini!', body: `${c.nama}${c.jam ? ' · pukul ' + c.jam : ''}`, icon: 'fa-champagne-glasses', color: 'bg-pink', pref: 'countdowns', action });
      if (days === 0 && c.jam) {
        const due = wibToEpoch(c.tanggal, c.jam);
        if (now >= due - lead && now < due) pushNotification({ key: `cd_lead_${sig}_${c.jam}`, title: '⏰ Event segera dimulai', body: `${c.nama} · pukul ${c.jam}`, icon: 'fa-hourglass-end', color: 'bg-purple', pref: 'countdowns', action });
      }
    });
  }

  if (prefs.kas && hour >= 20 && !appState.kas.some(k => k.tanggal === today)) {
    pushNotification({ key: 'kas_' + today, title: '💰 Catat kas hari ini', body: 'Belum ada entri Cash Ledger untuk hari ini.', icon: 'fa-wallet', color: 'bg-mint', pref: 'kas', action: { tab: 'tab-workfin', sub: 'sub-kas' } });
  }

  if (prefs.digest && hour >= 7 && hour < 12) {
    const agenda = appState.todos.filter(t => t.deadline === today && t.status !== 'Done').length;
    const events = appState.countdowns.filter(c => !c.isArchived && c.tanggal === today).length;
    if (agenda + events > 0) pushNotification({ key: 'digest_' + today, title: '☀️ Ringkasan pagi', body: `Hari ini: ${agenda} agenda${events ? ` & ${events} event` : ''}. Semangat, Hadzmi!`, icon: 'fa-sun', color: 'bg-orange', pref: 'digest', action: todoAction('today') });
  }

  // Bersihkan kunci lama (> 14 hari)
  const fired = readLS(NOTIF_FIRED_KEY, {});
  const cutoff = now - 14 * 86400000; let changed = false;
  Object.keys(fired).forEach(k => { if (fired[k] < cutoff) { delete fired[k]; changed = true; } });
  if (changed) writeLS(NOTIF_FIRED_KEY, fired);
}

function initNotifications() {
  updateNotifBadge();
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !/blogspot\.|blogger\./i.test(location.hostname)) {
    navigator.serviceWorker.register('sw.js').then(reg => { swRegistration = reg; }).catch(() => {});
  }
  checkReminders();
  reminderTimer = setInterval(checkReminders, 30000);
}
